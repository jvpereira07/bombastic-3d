import { NET, type ClientMessage, type MobState, type PlayerState, type ServerMessage } from './protocol';

export interface NetHandlers {
  onJoin(id: string, name: string): void;
  onLeave(id: string): void;
  onStates(list: { id: string; s: PlayerState }[], gone: string[]): void;
  onStatus(online: boolean): void;
  onOwners(owners: Record<string, string>): void;
  onMobs(list: MobState[], gone: string[]): void;
  onHit(id: string, dir: [number, number, number]): void;
  onHurt(dmg: number, dir: [number, number, number]): void;
  onFx(k: 'boom', p: [number, number, number]): void;
}

export interface SewerTicket { seed: number; fresh: boolean }

/** Conexão com o servidor do modo online. Sem servidor, o jogo segue normal (offline). */
export class NetClient {
  private socket: WebSocket | null = null;
  private nextReq = 1;
  private readonly pendingSewer = new Map<number, (ticket: SewerTicket) => void>();
  id: string | null = null;

  constructor(private readonly url: string, private readonly name: string, private readonly handlers: NetHandlers) {}

  /** Endereço padrão: mesmo host da página, porta do servidor; `?server=ws://...` troca. */
  static defaultUrl(): string {
    const custom = new URLSearchParams(location.search).get('server');
    return custom ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:${NET.PORT}`;
  }

  get connected(): boolean { return this.socket?.readyState === WebSocket.OPEN && this.id !== null; }

  connect(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener('open', () => this.send({ t: 'hello', name: this.name }));
    socket.addEventListener('message', (e) => {
      try { this.receive(JSON.parse(String(e.data)) as ServerMessage); } catch { /* mensagem inválida: ignora */ }
    });
    socket.addEventListener('close', () => {
      this.id = null;
      for (const resolve of this.pendingSewer.values()) resolve(NetClient.localTicket());
      this.pendingSewer.clear();
      this.handlers.onStatus(false);
    });
  }

  sendState(s: PlayerState): void { if (this.connected) this.send({ t: 'state', s }); }
  sendMobs(list: MobState[]): void { if (this.connected) this.send({ t: 'mobs', list }); }
  sendHit(id: string, dir: [number, number, number]): void { this.send({ t: 'hit', id, dir }); }
  sendHurt(to: string, dmg: number, dir: [number, number, number]): void { this.send({ t: 'hurt', to, dmg, dir }); }
  sendFx(k: 'boom', p: [number, number, number]): void { this.send({ t: 'fx', k, p }); }

  /** Semente do esgoto combinada com o servidor; offline (ou se cair), gera uma local. */
  requestSewer(): Promise<SewerTicket> {
    if (!this.connected) return Promise.resolve(NetClient.localTicket());
    const req = this.nextReq++;
    return new Promise((resolve) => {
      this.pendingSewer.set(req, resolve);
      this.send({ t: 'sewer', req });
    });
  }

  private static localTicket(): SewerTicket { return { seed: (Math.random() * 2 ** 32) >>> 0, fresh: true }; }

  private send(msg: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
  }

  private receive(msg: ServerMessage): void {
    const h = this.handlers;
    switch (msg.t) {
      case 'welcome':
        this.id = msg.id;
        for (const p of msg.players) h.onJoin(p.id, p.name);
        h.onStatus(true);
        break;
      case 'join': h.onJoin(msg.id, msg.name); break;
      case 'leave': h.onLeave(msg.id); break;
      case 'states': h.onStates(msg.list, msg.gone); break;
      case 'sewer': this.pendingSewer.get(msg.req)?.({ seed: msg.seed, fresh: msg.fresh }); this.pendingSewer.delete(msg.req); break;
      case 'owners': h.onOwners(msg.owners); break;
      case 'mobs': h.onMobs(msg.list, msg.gone); break;
      case 'hit': h.onHit(msg.id, msg.dir); break;
      case 'hurt': h.onHurt(msg.dmg, msg.dir); break;
      case 'fx': h.onFx(msg.k, msg.p); break;
    }
  }
}
