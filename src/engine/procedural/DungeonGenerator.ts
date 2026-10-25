import { rngRange, seededRng, type Rng } from '../rng';
import { Tile, TileGrid } from './TileGrid';

/** Sala retangular em coordenadas de célula (x, y = canto; w, h = tamanho). */
export interface Room { x: number; y: number; w: number; h: number }

export const roomCenter = (r: Room): { x: number; y: number } => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) });

export interface DungeonOptions {
  width: number; height: number;
  rooms: number;                          // tentativas de salas comuns
  roomSize: [number, number];             // lado mínimo e máximo
  bossRoom: { w: number; h: number };     // sala especial, sempre longe da entrada
  corridorWidth: number;                  // ímpar: o centro vira canal de água
  bridgeEvery: number;                    // a cada N células de canal, uma ponte
  extraLoops: number;                     // ligações além da árvore mínima (dá caminhos alternativos)
}

export interface DungeonLayout {
  seed: number;
  grid: TileGrid;
  rooms: Room[];
  start: Room;
  boss: Room;
}

/**
 * Masmorra por salas + corredores, só a partir da semente:
 * 1. a sala do chefe entra primeiro; salas comuns são sorteadas sem encostar umas nas outras;
 * 2. a entrada é a sala mais distante do chefe;
 * 3. árvore geradora mínima (Prim) liga tudo, mais alguns laços extras;
 * 4. corredores em L com canal de água no meio e pontes de tempos em tempos.
 */
export function generateDungeon(seed: number, o: DungeonOptions): DungeonLayout {
  const rng = seededRng(seed), grid = new TileGrid(o.width, o.height);
  const rooms: Room[] = [];
  const fits = (r: Room): boolean => r.x >= 1 && r.y >= 1 && r.x + r.w < o.width - 1 && r.y + r.h < o.height - 1
    && rooms.every((q) => r.x + r.w + 2 <= q.x || q.x + q.w + 2 <= r.x || r.y + r.h + 2 <= q.y || q.y + q.h + 2 <= r.y);

  const boss = placeRoom(rng, o.bossRoom.w, o.bossRoom.h, o, fits);
  rooms.push(boss);
  for (let i = 0; i < o.rooms; i++) {
    const w = Math.round(rngRange(rng, o.roomSize[0], o.roomSize[1])), h = Math.round(rngRange(rng, o.roomSize[0], o.roomSize[1]));
    const r = { x: Math.floor(rng() * (o.width - w)), y: Math.floor(rng() * (o.height - h)), w, h };
    if (fits(r)) rooms.push(r);
  }
  const dist = (a: Room, b: Room): number => { const p = roomCenter(a), q = roomCenter(b); return Math.hypot(p.x - q.x, p.y - q.y); };
  const start = rooms.slice(1).reduce((best, r) => (dist(r, boss) > dist(best, boss) ? r : best), rooms[1] ?? boss);

  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid.set(x, y, Tile.Floor);

  // Prim: a cada passo liga a sala de fora mais próxima de alguma já ligada
  const linked = new Set<Room>([start]), edges: [Room, Room][] = [];
  while (linked.size < rooms.length) {
    let best: [Room, Room] | null = null, bestD = Infinity;
    for (const a of linked) for (const b of rooms) if (!linked.has(b) && dist(a, b) < bestD) { bestD = dist(a, b); best = [a, b]; }
    if (!best) break;
    edges.push(best); linked.add(best[1]);
  }
  for (let i = 0; i < o.extraLoops; i++) {
    const a = rooms[Math.floor(rng() * rooms.length)]!, b = rooms[Math.floor(rng() * rooms.length)]!;
    if (a !== b && a !== boss && b !== boss) edges.push([a, b]); // o chefe só tem uma porta
  }
  for (const [a, b] of edges) carveCorridor(grid, roomCenter(a), roomCenter(b), rng() < 0.5, o);

  return { seed, grid, rooms, start, boss };
}

function placeRoom(rng: Rng, w: number, h: number, o: DungeonOptions, fits: (r: Room) => boolean): Room {
  for (let k = 0; k < 200; k++) {
    const r = { x: 1 + Math.floor(rng() * (o.width - w - 2)), y: 1 + Math.floor(rng() * (o.height - h - 2)), w, h };
    if (fits(r)) return r;
  }
  return { x: 1, y: 1, w, h };
}

/** Corredor em L (horizontal-depois-vertical ou o contrário) com canal no centro. */
function carveCorridor(grid: TileGrid, a: { x: number; y: number }, b: { x: number; y: number }, horizontalFirst: boolean, o: DungeonOptions): void {
  const half = Math.floor(o.corridorWidth / 2);
  const corner = horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  let step = 0;
  const segment = (from: { x: number; y: number }, to: { x: number; y: number }): void => {
    const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
    for (let x = from.x, y = from.y; ; x += dx, y += dy) {
      for (let k = -half; k <= half; k++) {
        const cx = dx ? x : x + k, cy = dx ? y + k : y;
        if (k === 0) grid.carve(cx, cy, step % o.bridgeEvery === o.bridgeEvery - 1 ? Tile.Bridge : Tile.Water);
        else grid.carve(cx, cy, Tile.Floor);
      }
      step++;
      if (x === to.x && y === to.y) break;
    }
  };
  segment(a, corner);
  segment(corner, b);
}
