import * as THREE from 'three';
import type { Assets } from '../../engine/Assets';
import { clamp } from '../../engine/math';
import { generateDungeon, isChamber, roomCenter, type DungeonLayout, type Room, type RoomKind } from '../../engine/procedural/DungeonGenerator';
import { Tile, isWalkable } from '../../engine/procedural/TileGrid';
import { disposeMeshes, meshTileGrid, type MeshMaterials } from '../../engine/procedural/TileMesher';
import { seededRng } from '../../engine/rng';
import { toonMaterial } from '../../engine/toon';
import { SEWER } from '../config';

const { SX, WATER_Y, WALL_H, TILE, GRID } = SEWER;

export interface Arena { center: THREE.Vector3; minX: number; maxX: number; minZ: number; maxZ: number }

/**
 * Esgoto como masmorra procedural: a cada entrada uma semente nova gera salas, galerias com
 * canal de água e pontes, e a arena do chefe sempre longe da entrada. A geometria vem da
 * engine em src/engine/procedural (grade → malhas); aqui ficam as regras do jogo em cima dela.
 */
export class Sewer {
  private static readonly ORIGIN = new THREE.Vector2(SX - (GRID * TILE) / 2, -(GRID * TILE) / 2);

  layout!: DungeonLayout;
  arena!: Arena;
  /** Onde o jogador chega e onde fica a tampa de saída (na sala de entrada). */
  readonly entry = new THREE.Vector3();
  readonly exitLid = new THREE.Vector3();

  private meshes: THREE.Group | null = null;
  private readonly materials: MeshMaterials;
  private readonly water: THREE.Texture;
  private readonly torch = new THREE.PointLight(0x9fe08a, 1.1 * Math.PI, 34, 0);
  private readonly arenaLight = new THREE.PointLight(0xffb060, 0.9 * Math.PI, 50, 0);

  static contains(x: number): boolean { return x > SX / 2; }

  /** Semente nova a cada entrada; no multiplayer quem decide é o dono do shard do esgoto. */
  static newSeed(): number { return (Math.random() * 2 ** 32) >>> 0; }

  constructor(private readonly root: THREE.Object3D, assets: Assets, anisotropy: number, seed: number) {
    const tile = (name: string): THREE.Texture => assets.tile(name, 1, 1, anisotropy);
    this.water = tile('water');
    this.materials = {
      floor: toonMaterial({ map: tile('floor') }),
      wall: toonMaterial({ map: tile('brick') }),
      water: new THREE.MeshBasicMaterial({ map: this.water, color: 0xb8d8a0 }),
    };
    root.add(this.torch, this.arenaLight);
    this.regenerate(seed);
  }

  /** Gera uma masmorra nova e troca a geometria antiga por ela. */
  regenerate(seed: number): void {
    this.layout = generateDungeon(seed, {
      width: GRID, height: GRID, cell: 12, nodes: 88, spine: [18, 28], bossRoom: { w: 10, h: 9 },
      bridgeEvery: 5, extraLoops: 10,
    });
    if (this.meshes) disposeMeshes(this.meshes);
    this.meshes = meshTileGrid(this.layout.grid, { tileSize: TILE, wallHeight: WALL_H, waterY: WATER_Y, origin: Sewer.ORIGIN }, this.materials);
    this.root.add(this.meshes);

    const boss = this.layout.boss;
    this.arena = {
      center: this.cellCenter(roomCenter(boss).x, roomCenter(boss).y),
      minX: Sewer.ORIGIN.x + boss.x * TILE, maxX: Sewer.ORIGIN.x + (boss.x + boss.w) * TILE,
      minZ: Sewer.ORIGIN.y + boss.y * TILE, maxZ: Sewer.ORIGIN.y + (boss.y + boss.h) * TILE,
    };
    this.arenaLight.position.copy(this.arena.center).setY(9);
    const start = this.layout.start, c = roomCenter(start);
    this.entry.copy(this.cellCenter(c.x, c.y));
    this.exitLid.copy(this.cellCenter(Math.min(c.x + 1, start.x + start.w - 1), c.y));
  }

  private cellCenter(gx: number, gy: number): THREE.Vector3 {
    return new THREE.Vector3(Sewer.ORIGIN.x + (gx + 0.5) * TILE, 0, Sewer.ORIGIN.y + (gy + 0.5) * TILE);
  }

  tileAt(x: number, z: number): Tile {
    return this.layout.grid.get(Math.floor((x - Sewer.ORIGIN.x) / TILE), Math.floor((z - Sewer.ORIGIN.y) / TILE));
  }

  inArena(p: THREE.Vector3): boolean {
    const a = this.arena;
    return Sewer.contains(p.x) && p.x > a.minX && p.x < a.maxX && p.z > a.minZ && p.z < a.maxZ;
  }

  /** Pontes só seguram quem já está na altura delas (`onTop`); por baixo é água. */
  height(x: number, z: number, onTop = false): number {
    const t = this.tileAt(x, z);
    if (t === Tile.Water) return WATER_Y;
    if (t === Tile.Bridge) return onTop ? 0 : WATER_Y;
    return 0;
  }

  /** Empurra um círculo de raio `margin` para fora das células de rocha em volta. */
  clamp(p: THREE.Vector3, margin = 0.6): void {
    const gx = Math.floor((p.x - Sewer.ORIGIN.x) / TILE), gy = Math.floor((p.z - Sewer.ORIGIN.y) / TILE);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (isWalkable(this.layout.grid.get(gx + dx, gy + dy))) continue;
      const x0 = Sewer.ORIGIN.x + (gx + dx) * TILE, z0 = Sewer.ORIGIN.y + (gy + dy) * TILE;
      const nx = clamp(p.x, x0, x0 + TILE), nz = clamp(p.z, z0, z0 + TILE);
      const ox = p.x - nx, oz = p.z - nz, d = Math.hypot(ox, oz);
      if (d >= margin) continue;
      if (d > 1e-5) { p.x = nx + (ox / d) * margin; p.z = nz + (oz / d) * margin; }
      else { p.x = x0 + TILE / 2 - dx * (TILE / 2 + margin); p.z = z0 + TILE / 2 - dy * (TILE / 2 + margin); } // centro dentro da rocha
    }
  }

  /** Câmera não atravessa parede: recua do alvo até o último ponto livre. */
  clampCamera(camera: THREE.Vector3, lookAt: THREE.Vector3): void {
    const step = camera.clone().sub(lookAt), length = step.length(), free = lookAt.clone();
    for (let s = 0.4; s <= length; s += 0.4) {
      const probe = lookAt.clone().addScaledVector(step, s / length);
      if (!isWalkable(this.tileAt(probe.x, probe.z))) break;
      free.copy(probe);
    }
    camera.x = free.x; camera.z = free.z;
    camera.y = Math.min(WALL_H - 0.6, camera.y);
  }

  /** Ponto de piso numa sala comum (nem entrada nem chefe); `kinds` restringe o tipo de sala. */
  randomFloor(rng: () => number = Math.random, kinds?: RoomKind[]): THREE.Vector3 {
    const common = this.layout.rooms.filter((r) => r !== this.layout.boss && r !== this.layout.start && isChamber(r));
    const picked = kinds ? common.filter((r) => kinds.includes(r.kind)) : [];
    const rooms = picked.length ? picked : common;
    const r: Room = rooms[Math.floor(rng() * rooms.length)] ?? this.layout.start;
    // tenta achar piso seco (salas podem ter pilar ou água)
    for (let k = 0; k < 12; k++) {
      const x = r.x + Math.floor(rng() * r.w), y = r.y + Math.floor(rng() * r.h);
      if (this.layout.grid.get(x, y) === Tile.Floor) return this.cellCenter(x, y);
    }
    const c = roomCenter(r);
    return this.cellCenter(c.x, c.y);
  }

  /** Células de canal longe da entrada, para os jacarés. */
  waterSpots(count: number, seed: number): THREE.Vector3[] {
    const spots: THREE.Vector3[] = [];
    this.layout.grid.forEach((x, y, t) => { if (t === Tile.Water) spots.push(this.cellCenter(x, y)); });
    const far = spots.filter((p) => p.distanceTo(this.entry) > 20), rng = seededRng(seed);
    const out: THREE.Vector3[] = [];
    while (out.length < count && far.length) out.push(far.splice(Math.floor(rng() * far.length), 1)[0]!);
    return out;
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.water.offset.y = (this.water.offset.y + dt * 0.15) % 1;
    this.torch.position.set(focus.x, focus.y + 5, focus.z);
  }
}
