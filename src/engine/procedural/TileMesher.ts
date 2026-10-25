import * as THREE from 'three';
import { Tile, isWalkable, type TileGrid } from './TileGrid';

export interface MeshStyle {
  tileSize: number;
  wallHeight: number;
  waterY: number;
  /** Canto mínimo da célula (0, 0) no mundo (x, z). */
  origin: THREE.Vector2;
}

export interface MeshMaterials { floor: THREE.Material; wall: THREE.Material; water: THREE.Material }

/** Acumula quads (2 triângulos) com UV em metros/tileSize, para virar uma BufferGeometry só. */
class QuadBuffer {
  private readonly pos: number[] = [];
  private readonly uv: number[] = [];
  private readonly normal: number[] = [];

  /** Quad pelos 4 cantos em ordem anti-horária vista da frente. */
  quad(corners: THREE.Vector3[], uvs: [number, number][], n: THREE.Vector3): void {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const c = corners[i]!, t = uvs[i]!;
      this.pos.push(c.x, c.y, c.z); this.uv.push(t[0], t[1]); this.normal.push(n.x, n.y, n.z);
    }
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.computeBoundingSphere();
    return geo;
  }
}

/** Lados de uma célula: deslocamento do vizinho e normal para dentro (x, z). */
const SIDES = [
  { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
] as const;

/**
 * Transforma uma TileGrid em 3 malhas (chão, paredes, água) — poucos draw calls por masmorra,
 * não importa o tamanho. Paredes só onde célula andável encosta em Void; o canal ganha
 * paredinhas do nível da água até o chão onde encosta em piso.
 */
export function meshTileGrid(grid: TileGrid, style: MeshStyle, materials: MeshMaterials): THREE.Group {
  const { tileSize: T, wallHeight: H, waterY: W, origin } = style;
  const floor = new QuadBuffer(), wall = new QuadBuffer(), water = new QuadBuffer();
  const up = new THREE.Vector3(0, 1, 0);
  const at = (gx: number, gy: number, y: number): THREE.Vector3 => new THREE.Vector3(origin.x + gx * T, y, origin.y + gy * T);
  const flatUv = (gx: number, gy: number): [number, number][] => [[gx, gy], [gx, gy + 1], [gx + 1, gy + 1], [gx + 1, gy]];

  /** Parede vertical na borda (lado `s`) da célula, de y0 a y1, virada para dentro da célula. */
  const side = (buf: QuadBuffer, gx: number, gy: number, s: (typeof SIDES)[number], y0: number, y1: number): void => {
    let a: [number, number], b: [number, number];
    if (s.dx === 1) { a = [gx + 1, gy + 1]; b = [gx + 1, gy]; }
    else if (s.dx === -1) { a = [gx, gy]; b = [gx, gy + 1]; }
    else if (s.dy === 1) { a = [gx, gy + 1]; b = [gx + 1, gy + 1]; }
    else { a = [gx + 1, gy]; b = [gx, gy]; }
    const n = new THREE.Vector3(-s.dx, 0, -s.dy);
    buf.quad([at(b[0], b[1], y0), at(a[0], a[1], y0), at(a[0], a[1], y1), at(b[0], b[1], y1)],
      [[0, y0 / T], [1, y0 / T], [1, y1 / T], [0, y1 / T]], n);
  };

  grid.forEach((gx, gy, t) => {
    if (!isWalkable(t)) return;
    const y = t === Tile.Water ? W : 0;
    const corners = [at(gx, gy, y), at(gx, gy + 1, y), at(gx + 1, gy + 1, y), at(gx + 1, gy, y)];
    (t === Tile.Water ? water : floor).quad(corners, flatUv(gx, gy), up);
    for (const s of SIDES) {
      const n = grid.get(gx + s.dx, gy + s.dy);
      if (!isWalkable(n)) side(wall, gx, gy, s, W - 0.3, H);              // parede da galeria
      else if (t === Tile.Water && n !== Tile.Water) side(wall, gx, gy, s, W, 0); // borda do canal
    }
    if (t === Tile.Bridge) { // laterais da ponte por cima da água
      for (const s of SIDES) if (grid.get(gx + s.dx, gy + s.dy) === Tile.Water) side(wall, gx + s.dx, gy + s.dy, { dx: -s.dx, dy: -s.dy } as (typeof SIDES)[number], W, 0);
    }
  });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(floor.build(), materials.floor), new THREE.Mesh(wall.build(), materials.wall),
    new THREE.Mesh(water.build(), materials.water));
  return group;
}

/** Libera as geometrias de um grupo gerado (os materiais são reaproveitados entre gerações). */
export function disposeMeshes(group: THREE.Object3D): void {
  group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  group.removeFromParent();
}
