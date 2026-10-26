import { rngPick, rngRange, seededRng, type Rng } from '../rng';
import { Tile, TileGrid } from './TileGrid';

/**
 * Tipo de cada nó da masmorra, pela função e pelo número de saídas:
 * - entrada / chefe: pontas do corredor principal (o chefe tem uma porta só);
 * - beco (1 saída): salinha sem saída, onde ficam os itens;
 * - passagem (2 saídas): sala de atravessar, às vezes cortada por um canal com ponte;
 * - curva / reta (2 saídas): só corredor, sem sala;
 * - salao (3 saídas): sala grande em T, com pilares;
 * - encruzilhada (4 saídas): praça com fonte ou anel de pilares no meio.
 */
export type RoomKind = 'entrada' | 'chefe' | 'beco' | 'passagem' | 'curva' | 'reta' | 'salao' | 'encruzilhada';

/** Sala retangular em coordenadas de célula (x, y = canto; w, h = tamanho). */
export interface Room { x: number; y: number; w: number; h: number; kind: RoomKind; exits: number }

export const roomCenter = (r: Pick<Room, 'x' | 'y' | 'w' | 'h'>): { x: number; y: number } => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });

/** Salas de verdade (tira os nós que são só corredor). */
export const isChamber = (r: Room): boolean => r.kind !== 'curva' && r.kind !== 'reta';

export interface DungeonOptions {
  width: number; height: number;
  cell: number;                           // lado de cada célula da malha de nós (em células da grade)
  nodes: number;                          // quantos nós ocupar ao todo
  spine: [number, number];                // comprimento mínimo e máximo do corredor principal (em nós)
  bossRoom: { w: number; h: number };     // sala do chefe, no fim do corredor principal
  bridgeEvery: number;                    // a cada N células de canal, uma ponte
  extraLoops: number;                     // ligações além da árvore (caminhos alternativos)
}

export interface DungeonLayout {
  seed: number;
  grid: TileGrid;
  rooms: Room[];
  start: Room;
  boss: Room;
}

interface Node { i: number; j: number; links: Node[]; main: Set<Node> }
type Edge = [Node, Node, boolean];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * Masmorra numa malha de nós, só a partir da semente:
 * 1. corredor principal: caminhada sem repetir da entrada até o chefe (largo, com canal e pontes);
 * 2. ramos crescem a partir dele até ocupar `nodes` nós, mais alguns laços (nunca no chefe);
 * 3. cada nó vira um tipo de sala conforme as saídas (ver RoomKind) e ganha decoração própria;
 * 4. corredores ligam os nós vizinhos; os laterais são mais estreitos e às vezes secos.
 */
export function generateDungeon(seed: number, o: DungeonOptions): DungeonLayout {
  const rng = seededRng(seed);
  const cols = Math.floor(o.width / o.cell), rows = Math.floor(o.height / o.cell);
  const { nodes, spine, edges } = buildGraph(rng, cols, rows, o);
  const grid = new TileGrid(o.width, o.height);
  const startNode = spine[0]!, bossNode = spine[spine.length - 1]!;

  const rooms = new Map<Node, Room>();
  for (const n of nodes) rooms.set(n, shapeRoom(rng, n, n === startNode ? 'entrada' : n === bossNode ? 'chefe' : classify(rng, n), o));
  for (const r of rooms.values()) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid.set(x, y, Tile.Floor);

  // decoração antes dos corredores: um corredor que cruza a sala reabre o pilar no caminho
  for (const r of rooms.values()) decorate(grid, rng, r);
  for (const [a, b, main] of edges) {
    const width = main ? 5 : rng() < 0.5 ? 3 : 1;
    const canal = main || (width === 3 && rng() < 0.5);
    const from = roomCenter(rooms.get(a)!), to = roomCenter(rooms.get(b)!);
    // o chefe tem uma porta só: corredor alheio escolhe o L que não atravessa a sala dele
    let horizontalFirst = rng() < 0.5;
    if (a !== bossNode && b !== bossNode && crosses(from, to, horizontalFirst, rooms.get(bossNode)!, width)) horizontalFirst = !horizontalFirst;
    carveCorridor(grid, from, to, horizontalFirst, width, canal, o.bridgeEvery);
  }

  return { seed, grid, rooms: [...rooms.values()], start: rooms.get(startNode)!, boss: rooms.get(bossNode)! };
}

/** Grafo na malha: espinha da entrada ao chefe, ramos e laços. Repete até a espinha ter o tamanho pedido. */
function buildGraph(rng: Rng, cols: number, rows: number, o: DungeonOptions): { nodes: Node[]; spine: Node[]; edges: Edge[] } {
  for (let attempt = 0; ; attempt++) {
    const at = new Map<string, Node>();
    const node = (i: number, j: number): Node => {
      const k = `${i},${j}`;
      let n = at.get(k);
      if (!n) { n = { i, j, links: [], main: new Set() }; at.set(k, n); }
      return n;
    };
    const free = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < cols && j < rows && !at.has(`${i},${j}`);
    const edges: Edge[] = [];
    const link = (a: Node, b: Node, main: boolean): void => {
      a.links.push(b); b.links.push(a); edges.push([a, b, main]);
      if (main) { a.main.add(b); b.main.add(a); }
    };

    // espinha: começa numa borda e anda sem repetir, preferindo seguir reto
    const edge = rng() < 0.5;
    let cur = node(edge ? 0 : Math.floor(rng() * cols), edge ? Math.floor(rng() * rows) : 0);
    const spine = [cur], want = Math.round(rngRange(rng, o.spine[0], o.spine[1]));
    let last: readonly [number, number] | null = null;
    while (spine.length < want) {
      const options = DIRS.filter(([dx, dy]) => free(cur.i + dx, cur.j + dy));
      if (!options.length) break;
      const straight = last && options.find((d) => d === last);
      const d: readonly [number, number] = straight && rng() < 0.55 ? straight : rngPick(rng, options);
      const next = node(cur.i + d[0], cur.j + d[1]);
      link(cur, next, true); spine.push(next); cur = next; last = d;
    }
    if (spine.length < o.spine[0] && attempt < 50) continue;
    const boss = cur;

    // ramos: cresce a partir de qualquer nó (menos o chefe) até ocupar `nodes`
    const all = () => [...at.values()];
    for (let tries = 0; at.size < o.nodes && tries < 500; tries++) {
      const from = rngPick(rng, all().filter((n) => n !== boss));
      const d = rngPick(rng, DIRS);
      if (free(from.i + d[0], from.j + d[1])) link(from, node(from.i + d[0], from.j + d[1]), false);
    }
    // laços: vizinhos ainda não ligados (dá caminhos alternativos e salas com mais saídas)
    for (let k = 0, made = 0; made < o.extraLoops && k < 200; k++) {
      const a = rngPick(rng, all()), d = rngPick(rng, DIRS), b = at.get(`${a.i + d[0]},${a.j + d[1]}`);
      if (!b || a === boss || b === boss || a.links.includes(b)) continue;
      link(a, b, false); made++;
    }
    return { nodes: all(), spine, edges };
  }
}

function classify(rng: Rng, n: Node): RoomKind {
  const exits = n.links.length;
  if (exits <= 1) return 'beco';
  if (exits === 3) return 'salao';
  if (exits >= 4) return 'encruzilhada';
  const [a, b] = n.links as [Node, Node];
  const straight = a.i === b.i || a.j === b.j;
  // dois caminhos: às vezes só corredor (reta ou curva), às vezes uma sala de passagem
  return rng() < 0.45 ? (straight ? 'reta' : 'curva') : 'passagem';
}

/** Retângulo de cada tipo, sorteado dentro da célula do nó (com folga de 1 para as paredes). */
function shapeRoom(rng: Rng, n: Node, kind: RoomKind, o: DungeonOptions): Room {
  const max = o.cell - 2;
  const size = (lo: number, hi: number): number => Math.min(max, Math.round(rngRange(rng, lo, hi)));
  let w: number, h: number;
  switch (kind) {
    case 'chefe': w = Math.min(max, o.bossRoom.w); h = Math.min(max, o.bossRoom.h); break;
    case 'entrada': w = h = size(5, 6); break;
    case 'beco': w = size(3, 5); h = size(3, 5); break;
    case 'curva': case 'reta': w = h = 3; break;
    case 'passagem': {
      // comprida no sentido em que se atravessa
      const horizontal = n.links.some((m) => m.j === n.j);
      const long = size(6, 9), short = size(3, 5);
      [w, h] = horizontal ? [long, short] : [short, long];
      break;
    }
    case 'salao': w = size(7, 9); h = size(6, 8); break;
    case 'encruzilhada': w = h = size(8, 10); break;
  }
  const x0 = n.i * o.cell + 1, y0 = n.j * o.cell + 1;
  return {
    x: x0 + Math.floor(rng() * (max - w + 1)), y: y0 + Math.floor(rng() * (max - h + 1)), w, h,
    kind, exits: n.links.length,
  };
}

/** Decoração por tipo, sempre fora da cruz central (por onde os corredores entram). */
function decorate(grid: TileGrid, rng: Rng, r: Room): void {
  const c = roomCenter(r);
  const pillar = (x: number, y: number): void => { if (Math.abs(x - c.x) > 1 && Math.abs(y - c.y) > 1) grid.set(x, y, Tile.Void); };
  if (r.kind === 'salao' || (r.kind === 'chefe' && rng() < 0.5)) {
    // pilares nos quatro cantos de dentro
    for (const [x, y] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]] as const) pillar(x, y);
  } else if (r.kind === 'encruzilhada') {
    if (rng() < 0.5) {
      // fonte: espelho d'água no centro, com ponte em cruz por cima
      for (let y = c.y - 2; y <= c.y + 2; y++) for (let x = c.x - 2; x <= c.x + 2; x++) {
        const cross = x === c.x || y === c.y;
        if (Math.abs(x - c.x) + Math.abs(y - c.y) <= 3) grid.set(x, y, cross ? Tile.Bridge : Tile.Water);
      }
    } else {
      // anel de pilares em volta do centro
      for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2], [-3, 0], [3, 0], [0, -3], [0, 3]] as const) {
        const x = c.x + dx, y = c.y + dy;
        if (dx && dy) pillar(x, y); else if (rng() < 0.5) grid.set(x, y, Tile.Water);
      }
    }
  } else if (r.kind === 'passagem' && rng() < 0.6) {
    // canal atravessando a sala, com ponte no meio
    const horizontal = r.w >= r.h;
    for (let k = 0; k < (horizontal ? r.h : r.w); k++) {
      const x = horizontal ? c.x : r.x + k, y = horizontal ? r.y + k : c.y;
      grid.set(x, y, (horizontal ? y === c.y : x === c.x) ? Tile.Bridge : Tile.Water);
    }
  } else if (r.kind === 'beco' && r.w >= 4 && r.h >= 4) {
    // um caixote (pilar) num canto para dar forma
    pillar(rng() < 0.5 ? r.x : r.x + r.w - 1, rng() < 0.5 ? r.y : r.y + r.h - 1);
  }
}

/** O corredor em L (com sua largura) passa pela sala `r` ou encosta nela? */
function crosses(a: { x: number; y: number }, b: { x: number; y: number }, horizontalFirst: boolean, r: Room, width: number): boolean {
  const m = Math.floor(width / 2) + 1, corner = horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  const hits = (p: { x: number; y: number }, q: { x: number; y: number }): boolean =>
    Math.max(p.x, q.x) + m >= r.x && Math.min(p.x, q.x) - m < r.x + r.w && Math.max(p.y, q.y) + m >= r.y && Math.min(p.y, q.y) - m < r.y + r.h;
  return hits(a, corner) || hits(corner, b);
}

/** Corredor em L de largura `width`; com `canal`, o centro é água com pontes de tempos em tempos. */
function carveCorridor(grid: TileGrid, a: { x: number; y: number }, b: { x: number; y: number }, horizontalFirst: boolean,
  width: number, canal: boolean, bridgeEvery: number): void {
  const half = Math.floor(width / 2);
  const corner = horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  let step = 0;
  const segment = (from: { x: number; y: number }, to: { x: number; y: number }): void => {
    const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
    for (let x = from.x, y = from.y; ; x += dx, y += dy) {
      for (let k = -half; k <= half; k++) {
        const cx = dx ? x : x + k, cy = dx ? y + k : y;
        if (k === 0 && canal) grid.carve(cx, cy, step % bridgeEvery === bridgeEvery - 1 ? Tile.Bridge : Tile.Water);
        else grid.carve(cx, cy, Tile.Floor);
      }
      step++;
      if (x === to.x && y === to.y) break;
    }
  };
  segment(a, corner);
  segment(corner, b);
}
