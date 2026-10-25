import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { NET, type ClientMessage, type MobState, type PlayerState, type ServerMessage } from '../src/net/protocol';
import { SHARD, shardAt, shardsAround, type ShardId } from '../src/game/world/shards';

/**
 * Servidor do modo online. Mantém quem está conectado, o shard de cada um, a semente da masmorra
 * do esgoto e o dono de cada shard ativo. Não simula nada: o dono de um shard simula os mobs dele
 * e o servidor repassa esses estados, golpes e danos a quem tem interesse (ver docs/online.md).
 */
interface Client {
  id: string;
  order: number;                // ordem de chegada: desempate na escolha de dono
  name: string;
  socket: WebSocket;
  state: PlayerState | null;
  shard: ShardId | null;
  seen: Set<string>;            // jogadores que ele via no último tick
  seenMobs: Set<string>;        // mobs que ele via no último tick
  sentMobs: Set<string>;        // mobs que ele mesmo simulava na última mensagem
  owners: string;               // último mapa de donos enviado (JSON), para só mandar quando muda
}

interface Mob { state: MobState; shard: ShardId; from: string }

const clients = new Map<string, Client>();
const mobs = new Map<string, Mob>();
const owners = new Map<ShardId, string>();
let sewerSeed: number | null = null;
let arrivals = 0;

const send = (c: Client, msg: ServerMessage): void => { if (c.socket.readyState === c.socket.OPEN) c.socket.send(JSON.stringify(msg)); };
const broadcast = (msg: ServerMessage, except?: Client): void => { for (const c of clients.values()) if (c !== except) send(c, msg); };

const cleanName = (raw: unknown): string => String(raw ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, NET.NAME_MAX) || 'Jogador';
const finite = (a: unknown, n: number): boolean => Array.isArray(a) && a.length === n && a.every(Number.isFinite);

function isState(s: unknown): s is PlayerState {
  const v = s as PlayerState;
  return !!v && finite(v.p, 3) && finite(v.d, 2) && ['move', 'attack', 'maraca', 'dash'].includes(v.sheet) && Number.isInteger(v.col);
}

function isMob(m: unknown): m is MobState {
  const v = m as MobState;
  return !!v && typeof v.id === 'string' && v.id.length < 40 && ['rat', 'bomb', 'gator', 'roach'].includes(v.k)
    && finite(v.p, 3) && finite(v.d, 2) && Number.isFinite(v.hp) && Number.isInteger(v.s) && Number.isInteger(v.c);
}

const interestOf = (c: Client): Set<ShardId> => (c.state ? shardsAround(c.state.p[0], c.state.p[2], NET.INTEREST_RADIUS) : new Set());

function handle(c: Client, msg: ClientMessage): void {
  switch (msg.t) {
    case 'hello':
      c.name = cleanName(msg.name);
      broadcast({ t: 'join', id: c.id, name: c.name }, c);
      break;
    case 'state':
      if (!isState(msg.s)) return;
      c.state = msg.s;
      c.shard = shardAt(msg.s.p[0], msg.s.p[2]);
      break;
    case 'sewer': {
      // alguém já está lá embaixo: entra na mesma masmorra (e os mobs são dele); senão, uma nova
      const occupied = [...clients.values()].some((o) => o !== c && o.shard === SHARD.SEWER);
      const fresh = !occupied || sewerSeed === null;
      if (fresh) sewerSeed = Math.floor(Math.random() * 2 ** 32);
      send(c, { t: 'sewer', req: msg.req, seed: sewerSeed!, fresh });
      break;
    }
    case 'mobs': {
      if (!Array.isArray(msg.list) || msg.list.length > 300) return;
      const now = new Set<string>();
      for (const m of msg.list) {
        if (!isMob(m)) continue;
        mobs.set(m.id, { state: m, shard: shardAt(m.p[0], m.p[2]), from: c.id });
        now.add(m.id);
      }
      // sumiu da lista e ninguém mais assumiu: morreu
      for (const id of c.sentMobs) if (!now.has(id) && mobs.get(id)?.from === c.id) mobs.delete(id);
      c.sentMobs = now;
      break;
    }
    case 'hit': {
      const mob = mobs.get(msg.id), sim = mob && clients.get(mob.from);
      if (sim && finite(msg.dir, 3)) send(sim, { t: 'hit', id: msg.id, dir: msg.dir });
      break;
    }
    case 'hurt': {
      const to = clients.get(msg.to);
      if (to && Number.isFinite(msg.dmg) && msg.dmg > 0 && msg.dmg <= 50 && finite(msg.dir, 3)) send(to, { t: 'hurt', dmg: msg.dmg, dir: msg.dir });
      break;
    }
    case 'fx': {
      if (msg.k !== 'boom' || !finite(msg.p, 3)) return;
      const shard = shardAt(msg.p[0], msg.p[2]);
      for (const o of clients.values()) if (o !== c && interestOf(o).has(shard)) send(o, { t: 'fx', k: 'boom', p: msg.p });
      break;
    }
  }
}

/**
 * Dono de cada shard ativo: quem tem o shard no raio de simulação. O dono atual continua enquanto
 * puder (evita trocar a toda hora); se sair, assume quem chegou primeiro ao servidor.
 */
function assignOwners(): void {
  const candidates = new Map<ShardId, Client[]>();
  for (const c of clients.values()) {
    if (!c.state) continue;
    for (const s of shardsAround(c.state.p[0], c.state.p[2], SHARD.SIM_RADIUS)) {
      const list = candidates.get(s) ?? [];
      list.push(c);
      candidates.set(s, list);
    }
  }
  for (const s of [...owners.keys()]) if (!candidates.has(s)) owners.delete(s);
  for (const [s, list] of candidates) {
    const current = owners.get(s);
    if (current && list.some((c) => c.id === current)) continue;
    owners.set(s, list.reduce((a, b) => (a.order < b.order ? a : b)).id);
  }
}

function tick(): void {
  assignOwners();
  // mob órfão (quem simulava saiu) num shard sem dono: ninguém vai assumir, some
  for (const [id, m] of mobs) if (!clients.has(m.from) && !owners.has(m.shard)) mobs.delete(id);
  for (const c of clients.values()) {
    if (!c.state) continue;
    const interest = interestOf(c);

    const players: { id: string; s: PlayerState }[] = [], seen = new Set<string>();
    for (const o of clients.values()) {
      if (o === c || !o.state || !o.shard || !interest.has(o.shard)) continue;
      players.push({ id: o.id, s: o.state });
      seen.add(o.id);
    }
    const goneP = [...c.seen].filter((id) => !seen.has(id));
    c.seen = seen;
    if (players.length || goneP.length) send(c, { t: 'states', list: players, gone: goneP });

    const list: MobState[] = [], seenMobs = new Set<string>();
    for (const [id, m] of mobs) {
      if (m.from === c.id || !interest.has(m.shard)) continue;
      list.push(m.state);
      seenMobs.add(id);
    }
    const goneM = [...c.seenMobs].filter((id) => !seenMobs.has(id));
    c.seenMobs = seenMobs;
    if (list.length || goneM.length) send(c, { t: 'mobs', list, gone: goneM });

    const mine: Record<string, string> = {};
    for (const s of interest) { const o = owners.get(s); if (o) mine[s] = o; }
    const json = JSON.stringify(mine);
    if (json !== c.owners) { c.owners = json; send(c, { t: 'owners', owners: mine }); }
  }
}

const port = Number(process.env.PORT ?? NET.PORT);
const wss = new WebSocketServer({ port });
wss.on('connection', (socket) => {
  const c: Client = {
    id: randomUUID().slice(0, 8), order: arrivals++, name: 'Jogador', socket, state: null, shard: null,
    seen: new Set(), seenMobs: new Set(), sentMobs: new Set(), owners: '',
  };
  clients.set(c.id, c);
  send(c, {
    t: 'welcome', id: c.id, worldSeed: SHARD.WORLD_SEED,
    players: [...clients.values()].filter((o) => o !== c).map((o) => ({ id: o.id, name: o.name, state: null })),
  });
  socket.on('message', (data) => {
    if (data.toString().length > 64_000) return;
    try { handle(c, JSON.parse(data.toString()) as ClientMessage); } catch { /* mensagem inválida: ignora */ }
  });
  socket.on('close', () => {
    clients.delete(c.id);
    // os mobs dele continuam na tabela: quem herdar o shard assume a partir dos fantoches
    broadcast({ t: 'leave', id: c.id });
  });
});
setInterval(tick, 1000 / NET.TICK_HZ);
console.log(`Servidor do Bombastic 3D em ws://localhost:${port}`);
