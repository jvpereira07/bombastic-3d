import * as THREE from 'three';
import type { Assets } from '../../engine/Assets';
import { smoothstep } from '../../engine/math';
import { hashSeed, rngPick, rngRange, seededRng, type Rng } from '../../engine/rng';
import { toonMaterial } from '../../engine/toon';
import { OVERWORLD } from '../config';
import { BiomeSprites, ProceduralSprites } from './pixelArt';
import { SHARD, allShards, shardId, shardOrigin, type ShardCoord, type ShardId } from './shards';

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
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

export type Biome = 'grass' | 'desert' | 'ice' | 'beach';

interface SceneryTextures {
  tree: THREE.Texture[]; pink: THREE.Texture[]; bush: THREE.Texture[]; props: THREE.Texture[]; flower: THREE.Texture[];
  cactus: THREE.Texture[]; pine: THREE.Texture[]; palm: THREE.Texture[];
  sandRock: THREE.Texture[]; iceRock: THREE.Texture[]; deadBush: THREE.Texture[];
  tuft: THREE.SpriteMaterial;
}

/** Peso de cada bioma num ponto: grama no centro; deserto a leste, gelo ao norte, praia ao sul. */
interface BiomeWeights { desert: number; ice: number; beach: number }

/** Superfície: colinas em terraços no centro e três biomas em volta, com mar ao sul. Gerada shard a shard (ver shards.ts). */
export class Overworld {
  private static readonly TERRACE = 2.6;
  private static readonly WALL = OVERWORLD.HALF - 10;
  private static readonly SEGMENTS = 45;          // por shard: 8 x 45 = 360 na superfície toda
  private static readonly PROPS_PER_SHARD = 22;
  private static readonly TUFTS_PER_SHARD = 45;

  static weights(x: number, z: number): BiomeWeights {
    const r = Math.hypot(x, z);
    const out = smoothstep(clamp01((r - 75 + (fbm(x * 0.03, z * 0.03) - 0.5) * 30) / 35)); // sai da grama entre ~75 e ~110 m
    if (out <= 0) return { desert: 0, ice: 0, beach: 0 };
    const nx = x / r, nz = z / r, sector = (d: number): number => smoothstep(clamp01((d - 0.3) / 0.5));
    const desert = sector(nx), ice = sector(-nz), beach = sector(nz), sum = Math.max(1, desert + ice + beach); // nas diagonais divide
    return { desert: (out * desert) / sum, ice: (out * ice) / sum, beach: (out * beach) / sum };
  }

  static biome(x: number, z: number): Biome {
    const w = Overworld.weights(x, z), best = Math.max(w.desert, w.ice, w.beach);
    if (best < 0.5) return 'grass';
    return best === w.desert ? 'desert' : best === w.ice ? 'ice' : 'beach';
  }

  private static hills(x: number, z: number): number {
    let h = (fbm(x * 0.018 + 11, z * 0.018 + 7) - 0.45) * 22; // colinas irregulares
    h += (fbm(x * 0.07, z * 0.07) - 0.5) * 2;                 // calombos
    const f = h / Overworld.TERRACE, i = Math.floor(f), fr = f - i;
    return (i + smoothstep(clamp01((fr - 0.72) / 0.28))) * Overworld.TERRACE + fr * 0.6; // platô + degrau
  }

  static height(x: number, z: number): number {
    const w = Overworld.weights(x, z), r = Math.hypot(x, z);
    const grass = Overworld.hills(x, z);
    const dunes = (Math.sin(x * 0.07 + Math.sin(z * 0.045) * 2.4) * 0.5 + 0.5) * 6 + fbm(x * 0.02, z * 0.02) * 4;
    const glacier = Overworld.hills(x * 0.8 + 40, z * 0.8) * 1.4 + 3;
    const shore = Math.max(-2.2, 1.2 - Math.max(0, z - 115) * 0.05 + (fbm(x * 0.05, z * 0.05) - 0.5) * 1.2);
    let h = grass * (1 - w.desert - w.ice - w.beach) + dunes * w.desert + glacier * w.ice + shore * w.beach;
    if (r < 8) h *= r / 8;                                      // início plano
    const wall = Math.max(0, (Math.max(Math.abs(x), Math.abs(z)) - Overworld.WALL) * 0.8);
    return h + (w.beach > 0.5 ? 0 : wall);                      // paredão nas bordas, menos no mar
  }

  static contains(x: number): boolean { return Math.abs(x) <= OVERWORLD.SIZE; }

  /** Um grupo por shard: liga/desliga a visibilidade de terreno + cenário daquele pedaço de uma vez. */
  readonly shards = new Map<ShardId, THREE.Group>();

  constructor(scene: THREE.Scene, assets: Assets, anisotropy: number, keepClear: THREE.Vector3[]) {
    const terrain = Overworld.terrainMaterial(assets, anisotropy);
    const scenery = Overworld.sceneryTextures(assets);
    for (const coord of allShards()) {
      const group = new THREE.Group();
      group.name = `shard ${shardId(coord)}`;
      const rng = seededRng(hashSeed(SHARD.WORLD_SEED, coord.sx, coord.sz));
      group.add(Overworld.buildTerrain(coord, terrain, rng));
      Overworld.scatterScenery(group, coord, scenery, keepClear, rng);
      this.shards.set(shardId(coord), group);
      scene.add(group);
    }
    scene.add(Overworld.buildSea());
  }

  /** Normal pela derivada da altura: igual dos dois lados da emenda entre shards (sem costura na luz). */
  private static normalAt(x: number, z: number): THREE.Vector3 {
    const e = 0.5;
    return new THREE.Vector3(
      Overworld.height(x - e, z) - Overworld.height(x + e, z), 2 * e, Overworld.height(x, z - e) - Overworld.height(x, z + e),
    ).normalize();
  }

  /** Metros cobertos por uma repetição das fotos de chão. */
  private static readonly GROUND_TILE = 4;
  /** Fotos de chão (ambientCG, CC0), na ordem dos pesos: grama, terra, areia, neve; o que sobra é rocha. */
  private static readonly GROUND_LAYERS = ['chao_grama', 'chao_terra', 'chao_areia', 'chao_neve', 'chao_rocha'] as const;

  /**
   * Terreno com cel shading e cinco fotos de chão misturadas por vértice (`splat` = grama, terra,
   * areia, neve; rocha é o resto). Cada foto é lida em duas escalas para disfarçar a repetição.
   * `shade` escurece um pouco cada vértice (variação e areia molhada).
   */
  private static terrainMaterial(assets: Assets, anisotropy: number): THREE.MeshToonMaterial {
    const layers = Overworld.GROUND_LAYERS.map((name) => {
      const t = assets.tile(name, 1, 1, anisotropy);
      t.magFilter = THREE.LinearFilter;
      return t;
    });
    const m = toonMaterial();
    m.onBeforeCompile = (shader) => {
      layers.forEach((t, i) => { shader.uniforms[`ground${i}`] = { value: t }; });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec4 splat;
attribute float shade;
varying vec4 vSplat;
varying float vShade;
varying vec2 vGroundUv;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vSplat = splat; vShade = shade; vGroundUv = (modelMatrix * vec4(position, 1.0)).xz / ${Overworld.GROUND_TILE.toFixed(1)};`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform sampler2D ground0, ground1, ground2, ground3, ground4;
varying vec4 vSplat;
varying float vShade;
varying vec2 vGroundUv;
vec3 ground(sampler2D t) { return mix(texture2D(t, vGroundUv).rgb, texture2D(t, vGroundUv * 0.23 + 0.37).rgb, 0.35); }`)
        .replace('#include <map_fragment>', `float rock = max(0.0, 1.0 - dot(vSplat, vec4(1.0)));
diffuseColor.rgb *= (ground(ground0) * vSplat.x * vec3(1.15, 1.45, 0.9) + ground(ground1) * vSplat.y * vec3(1.15, 1.0, 0.85) + ground(ground2) * vSplat.z * 1.1
  + ground(ground3) * vSplat.w * 1.05 + ground(ground4) * rock * vec3(1.35, 1.45, 1.6)) * vShade;`);
    };
    return m;
  }

  private static buildTerrain(coord: ShardCoord, material: THREE.Material, rng: Rng): THREE.Mesh {
    const seg = Overworld.SEGMENTS, origin = shardOrigin(coord);
    const geo = new THREE.PlaneGeometry(SHARD.SIZE, SHARD.SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    geo.translate(origin.x + SHARD.SIZE / 2, 0, origin.y + SHARD.SIZE / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const normals = new Float32Array(pos.count * 3), splat = new Float32Array(pos.count * 4), shade = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = Overworld.height(x, z), n = Overworld.normalAt(x, z);
      pos.setY(i, y);
      normals.set([n.x, n.y, n.z], i * 3);
      splat.set(Overworld.groundSplat(x, z, n.y), i * 4);
      shade[i] = (Overworld.weights(x, z).beach > 0.5 && y < OVERWORLD.SEA_Y + 0.4 ? 0.8 : 1) * (0.94 + rng() * 0.06);
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
    geo.setAttribute('shade', new THREE.BufferAttribute(shade, 1));
    geo.computeBoundingSphere();
    return new THREE.Mesh(geo, material);
  }

  /**
   * Quanto de cada foto de chão vai num vértice: [grama, terra, areia, neve] (rocha = o que falta para 1).
   * Grama plana / terra na encosta; deserto e praia em areia (encosta do deserto puxa para terra);
   * gelo em neve, com rocha nas encostas.
   */
  private static groundSplat(x: number, z: number, ny: number): [number, number, number, number] {
    const w = Overworld.weights(x, z), grassBiome = 1 - w.desert - w.ice - w.beach;
    const steep = smoothstep(clamp01((0.86 - ny) / 0.14));
    return [
      grassBiome * (1 - steep),
      grassBiome * steep + w.desert * steep * 0.6,
      w.desert * (1 - steep * 0.6) + w.beach,
      w.ice * (1 - steep),
    ];
  }

  /** Cor do chão: encosta íngreme vira terra/rocha; o resto segue o bioma (com borda pontilhada entre biomas). */
  private static groundColor(x: number, y: number, z: number, ny: number, rng: Rng): number {
    const w = Overworld.weights(x, z), jitter = (rng() - 0.5) * 0.25;
    const best = Math.max(w.desert, w.ice, w.beach) + jitter;
    const steep = ny < 0.72, mid = ny < 0.85;
    if (best < 0.5) return steep ? (y % 1.3 < 0.65 ? 0xa57a4e : 0xb98a5a) : mid ? 0x7aa24c : 0x4a9e38;
    if (best === w.desert + jitter) return steep ? 0xc0925a : mid ? 0xdcb978 : 0xebcf8e;
    if (best === w.ice + jitter) return steep ? 0x8db6d8 : mid ? 0xcfe6f7 : 0xf2f9ff;
    return y < OVERWORLD.SEA_Y + 0.4 ? 0xd2b87e : steep ? 0xc8ad74 : 0xf3e2a8; // areia molhada perto da água
  }

  /**
   * Cor do mapa num ponto: a mesma cor de chão do terreno (bioma e encosta), com sombra de relevo
   * vinda do noroeste; abaixo do nível do mar, a cor do mar escurecendo com a profundidade.
   */
  static mapColor(x: number, z: number): THREE.Color {
    const y = Overworld.height(x, z);
    if (Overworld.isSea(x, z)) {
      const depth = Math.min(1, (OVERWORLD.SEA_Y - y) / 4);
      return new THREE.Color(Overworld.SEA_COLOR).offsetHSL(0, 0, -0.18 * depth);
    }
    const n = Overworld.normalAt(x, z);
    const color = new THREE.Color(Overworld.groundColor(x, y, z, n.y, () => 0.5));
    const light = n.dot(new THREE.Vector3(-0.5, 0.75, -0.45).normalize());
    return color.multiplyScalar(0.7 + 0.4 * light);
  }

  private static readonly SEA_COLOR = 0x3aa6d8;
  /** Faixa do plano do mar (só no sul): centro e profundidade em z. */
  private static readonly SEA_Z = OVERWORLD.HALF + 20;
  private static readonly SEA_DEPTH = 200;

  /** Há água visível aqui: dentro do plano do mar e com o chão abaixo dele. */
  static isSea(x: number, z: number): boolean {
    return Math.abs(z - Overworld.SEA_Z) <= Overworld.SEA_DEPTH / 2 && Overworld.height(x, z) < OVERWORLD.SEA_Y;
  }

  private static buildSea(): THREE.Mesh {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(OVERWORLD.SIZE * 1.6, Overworld.SEA_DEPTH),
      toonMaterial({ color: Overworld.SEA_COLOR, transparent: true, opacity: 0.85 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, OVERWORLD.SEA_Y, Overworld.SEA_Z);
    return sea;
  }

  /** Texturas de cenário criadas uma vez e compartilhadas por todos os shards. */
  private static sceneryTextures(assets: Assets): SceneryTextures {
    return {
      tree: [ProceduralSprites.tree(), ProceduralSprites.tree(), ProceduralSprites.tree()],
      pink: [ProceduralSprites.pinkTree(), ProceduralSprites.pinkTree()],
      bush: [ProceduralSprites.bush(), ProceduralSprites.bush()],
      props: [assets.pixel('barril'), assets.pixel('vaso')],
      flower: ['#ffd23a', '#ff6f91', '#7ec8ff', '#ffffff'].map(ProceduralSprites.flower),
      cactus: [BiomeSprites.cactus(), BiomeSprites.cactus()],
      pine: [BiomeSprites.pine(), BiomeSprites.pine()],
      palm: [BiomeSprites.palm(), BiomeSprites.palm()],
      sandRock: [BiomeSprites.sandRock()], iceRock: [BiomeSprites.iceRock()], deadBush: [BiomeSprites.deadBush()],
      tuft: new THREE.SpriteMaterial({ map: ProceduralSprites.tuft(), transparent: true, alphaTest: 0.5 }),
    };
  }

  private static scatterScenery(group: THREE.Group, coord: ShardCoord, v: SceneryTextures, keepClear: THREE.Vector3[], rng: Rng): void {
    const origin = shardOrigin(coord), R = OVERWORLD.HALF - 12;
    const spot = (): { x: number; z: number } | null => {
      const x = origin.x + rng() * SHARD.SIZE, z = origin.y + rng() * SHARD.SIZE;
      return Math.abs(x) > R || Math.abs(z) > R ? null : { x, z };
    };
    const add = (map: THREE.Texture, w: number, h: number, x: number, z: number): void => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.5 }));
      s.scale.set(w, h, 1); s.center.set(0.5, 0);
      s.position.set(x, Overworld.height(x, z) - 0.05, z);
      group.add(s);
    };
    for (let i = 0; i < Overworld.PROPS_PER_SHARD; i++) {
      const p = spot(), r = rng();
      if (!p) continue;
      const { x, z } = p;
      if (Math.hypot(x, z) < 6 || keepClear.some((c) => Math.hypot(x - c.x, z - c.z) < 3)) continue;
      if (Overworld.height(x, z) < OVERWORLD.SEA_Y + 0.3) continue; // nada dentro do mar
      switch (Overworld.biome(x, z)) {
        case 'desert':
          if (r < 0.35) { const k = rngRange(rng, 3, 4.5); add(rngPick(rng, v.cactus), k * 0.62, k, x, z); }
          else if (r < 0.6) add(rngPick(rng, v.deadBush), 2, 1.25, x, z);
          else if (r < 0.75) add(rngPick(rng, v.sandRock), 1.8, 1.3, x, z);
          break;
        case 'ice':
          if (r < 0.45) { const k = rngRange(rng, 5, 7.5); add(rngPick(rng, v.pine), k * 0.67, k, x, z); }
          else if (r < 0.65) add(rngPick(rng, v.iceRock), 2, 1.4, x, z);
          break;
        case 'beach':
          if (r < 0.3) { const k = rngRange(rng, 6, 8); add(rngPick(rng, v.palm), k * 0.75, k, x, z); }
          else if (r < 0.45) add(rngPick(rng, v.sandRock), 1.4, 1, x, z);
          break;
        default:
          if (r < 0.3) { const k = rngRange(rng, 5, 7); add(rngPick(rng, v.tree), k * 0.8, k, x, z); }
          else if (r < 0.4) add(rngPick(rng, v.pink), 4, 4.8, x, z);
          else if (r < 0.6) add(rngPick(rng, v.bush), 2.4, 1.6, x, z);
          else if (r < 0.7) add(rngPick(rng, v.props), 1.4, 1.4, x, z);
          else add(rngPick(rng, v.flower), 0.6, 1, x, z);
      }
    }
    for (let i = 0; i < Overworld.TUFTS_PER_SHARD; i++) {
      const p = spot(), k = rngRange(rng, 0.6, 1.1);
      if (!p) continue;
      const y = Overworld.height(p.x, p.z);
      if (y > 7 || Overworld.biome(p.x, p.z) !== 'grass') continue;
      const t = new THREE.Sprite(v.tuft);
      t.scale.set(k, k * 0.75, 1); t.center.set(0.5, 0); t.position.set(p.x, y - 0.05, p.z);
      group.add(t);
    }
  }
}
