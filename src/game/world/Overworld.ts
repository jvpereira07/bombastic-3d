import * as THREE from 'three';
import { toonMaterial } from '../../engine/toon';
import type { Assets } from '../../engine/Assets';
import { pick, rnd, smoothstep } from '../../engine/math';
import { OVERWORLD } from '../config';
import { ProceduralSprites } from './pixelArt';

const hash = (x: number, z: number): number => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z), xf = smoothstep(x - xi), zf = smoothstep(z - zi);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf;
}
function fbm(x: number, z: number): number {
  let v = 0, amp = 1, f = 1, total = 0;
  for (let o = 0; o < 5; o++) { v += valueNoise(x * f, z * f) * amp; total += amp; amp *= 0.5; f *= 2.03; }
  return v / total;
}

/** Superfície: colinas em terraços (barrancos), grama e cenário em pixel art. */
export class Overworld {
  private static readonly TERRACE = 2.6;

  static height(x: number, z: number): number {
    let h = (fbm(x * 0.018 + 11, z * 0.018 + 7) - 0.45) * 22; // colinas irregulares
    h += (fbm(x * 0.07, z * 0.07) - 0.5) * 2;                 // calombos
    const f = h / Overworld.TERRACE, i = Math.floor(f), fr = f - i;
    h = (i + smoothstep(Math.min(1, Math.max(0, (fr - 0.72) / 0.28)))) * Overworld.TERRACE + fr * 0.6; // platô + degrau
    const r = Math.hypot(x, z);
    if (r < 8) h *= r / 8;                                    // início plano
    return h + Math.max(0, (r - 85) * 0.6);                   // paredão nas bordas
  }

  static contains(x: number): boolean { return Math.abs(x) <= OVERWORLD.SIZE; }

  constructor(scene: THREE.Scene, assets: Assets, anisotropy: number, keepClear: THREE.Vector3[]) {
    scene.add(this.buildTerrain(anisotropy));
    this.scatterScenery(scene, assets, keepClear);
  }

  private buildTerrain(anisotropy: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(OVERWORLD.SIZE, OVERWORLD.SIZE, 220, 220);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, Overworld.height(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const normal = geo.attributes.normal as THREE.BufferAttribute, colors: number[] = [];
    for (let i = 0; i < pos.count; i++) { // encosta íngreme vira terra, o resto grama
      const ny = normal.getY(i), y = pos.getY(i);
      const c = new THREE.Color(ny < 0.72 ? 0xb98a5a : ny < 0.85 ? 0x7aa24c : 0x4a9e38)
        .offsetHSL(0, 0, Math.random() * 0.03 + (ny < 0.72 && y % 1.3 < 0.65 ? -0.06 : 0));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.array.length; i++) (uv.array as Float32Array)[i]! *= 40;
    const grass = ProceduralSprites.grassDetail();
    grass.anisotropy = anisotropy;
    return new THREE.Mesh(geo, toonMaterial({ map: grass, vertexColors: true }));
  }

  private scatterScenery(scene: THREE.Scene, assets: Assets, keepClear: THREE.Vector3[]): void {
    const variants = {
      tree: [ProceduralSprites.tree(), ProceduralSprites.tree(), ProceduralSprites.tree()],
      pink: [ProceduralSprites.pinkTree(), ProceduralSprites.pinkTree()],
      bush: [ProceduralSprites.bush(), ProceduralSprites.bush()],
      props: [assets.pixel('barril'), assets.pixel('vaso')],
      flower: ['#ffd23a', '#ff6f91', '#7ec8ff', '#ffffff'].map(ProceduralSprites.flower),
    };
    const add = (map: THREE.Texture, w: number, h: number, x: number, z: number): void => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.5 }));
      s.scale.set(w, h, 1); s.center.set(0.5, 0);
      s.position.set(x, Overworld.height(x, z) - 0.05, z);
      scene.add(s);
    };
    for (let i = 0; i < 260; i++) {
      const x = rnd(-100, 100), z = rnd(-100, 100);
      if (Math.hypot(x, z) < 6 || keepClear.some((p) => Math.hypot(x - p.x, z - p.z) < 3)) continue;
      const r = Math.random();
      if (r < 0.3) { const k = rnd(5, 7); add(pick(variants.tree), k * 0.8, k, x, z); }
      else if (r < 0.4) add(pick(variants.pink), 4, 4.8, x, z);
      else if (r < 0.6) add(pick(variants.bush), 2.4, 1.6, x, z);
      else if (r < 0.7) add(pick(variants.props), 1.4, 1.4, x, z);
      else add(pick(variants.flower), 0.6, 1, x, z);
    }
    const tuft = new THREE.SpriteMaterial({ map: ProceduralSprites.tuft(), transparent: true, alphaTest: 0.5 });
    for (let i = 0; i < 1800; i++) {
      const x = rnd(-100, 100), z = rnd(-100, 100), y = Overworld.height(x, z);
      if (y > 7) continue;
      const t = new THREE.Sprite(tuft), k = rnd(0.6, 1.1);
      t.scale.set(k, k * 0.75, 1); t.center.set(0.5, 0); t.position.set(x, y - 0.05, z);
      scene.add(t);
    }
  }
}
