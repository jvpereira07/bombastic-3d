import * as THREE from 'three';
import type { Assets } from '../../engine/Assets';
import { smoothstep } from '../../engine/math';
import { hashSeed, rngPick, rngRange, seededRng, type Rng } from '../../engine/rng';
import { toonMaterial } from '../../engine/toon';
import { OVERWORLD } from '../config';
import { BiomeSprites, ProceduralSprites } from './pixelArt';
import { SHARD, allShards, shardCoord, shardId, shardOrigin, type ShardCoord, type ShardId } from './shards';

/** Hash inteiro de uma célula da grade de ruído, em [0, 1) (bem mais barato que o truque com seno). */
const hash = (x: number, z: number): number => {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
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

/** fbm de 3 oitavas: mais barato, para formas grandes (fronteiras de bioma, rios). */
function fbm3(x: number, z: number): number {
  return (valueNoise(x, z) + valueNoise(x * 2.03, z * 2.03) * 0.5 + valueNoise(x * 4.1, z * 4.1) * 0.25) / 1.75;
}

/** Biomas em volta da grama do centro (a grama é o que sobra dos pesos). */
const RING = ['desert', 'mountain', 'ice', 'forest', 'swamp', 'beach'] as const;
type RingBiome = (typeof RING)[number];
export type Biome = 'grass' | RingBiome;

/**
 * Direção (no plano x, z) de cada bioma do anel: deserto a leste, montanhas a nordeste, gelo ao norte,
 * floresta a oeste, pântano a sudoeste e praia (com o mar) ao sul. Norte é -z.
 */
const DIRECTIONS: Record<RingBiome, readonly [number, number]> = {
  desert: [1, 0], mountain: [Math.SQRT1_2, -Math.SQRT1_2], ice: [0, -1],
  forest: [-1, 0], swamp: [-Math.SQRT1_2, Math.SQRT1_2], beach: [0, 1],
};

interface SceneryTextures {
  tree: THREE.Texture[]; pink: THREE.Texture[]; bush: THREE.Texture[]; props: THREE.Texture[]; flower: THREE.Texture[];
  cactus: THREE.Texture[]; pine: THREE.Texture[]; palm: THREE.Texture[];
  sandRock: THREE.Texture[]; iceRock: THREE.Texture[]; deadBush: THREE.Texture[];
  tuft: THREE.SpriteMaterial;
}

/** Peso (0 a 1) de cada bioma do anel num ponto; a soma é no máximo 1 e o resto é grama. */
type BiomeWeights = Record<RingBiome, number>;
const NO_RING: BiomeWeights = { desert: 0, mountain: 0, ice: 0, forest: 0, swamp: 0, beach: 0 };

/**
 * Superfície: colinas em terraços no centro e seis biomas em volta (deserto, montanhas, gelo, floresta,
 * pântano e praia com mar ao sul), cortada por rios. Gerada shard a shard (ver shards.ts).
 */
export class Overworld {
  private static readonly TERRACE = 2.6;
  private static readonly WALL = OVERWORLD.HALF - 10;
  private static readonly SEGMENTS = 45;          // por shard (55 m): ~1,2 m entre vértices
  private static readonly PROPS_PER_SHARD = 22;
  private static readonly TUFTS_PER_SHARD = 45;
  /** Raio (m) onde a grama do centro dá lugar aos outros biomas (com variação de ruído). */
  private static readonly GRASS_RADIUS = 125;
  /** Rios: largura da água e da margem (m), e raio em volta do início sem rio. */
  private static readonly RIVER_WATER = 4.5;
  private static readonly RIVER_BANK = 9;
  private static readonly RIVER_FREE = 30;
  /** Altura do chão plano do início. */
  private static readonly START_Y = 4;

  static weights(x: number, z: number): BiomeWeights {
    const r = Math.hypot(x, z);
    const out = smoothstep(clamp01((r - Overworld.GRASS_RADIUS + (fbm3(x * 0.012, z * 0.012) - 0.5) * 70) / 45));
    if (out <= 0) return NO_RING;
    // direção torcida por ruído: as fronteiras entre biomas ficam onduladas
    const twist = (fbm3(x * 0.006 + 31, z * 0.006 - 17) - 0.5) * 1.6, c = Math.cos(twist), s = Math.sin(twist);
    const nx = (x * c - z * s) / r, nz = (x * s + z * c) / r;
    const raw = {} as BiomeWeights;
    let sum = 0;
    for (const b of RING) {
      const [dx, dz] = DIRECTIONS[b];
      sum += raw[b] = smoothstep(clamp01((nx * dx + nz * dz - 0.55) / 0.4)) ** 2;
    }
    for (const b of RING) raw[b] = (out * raw[b]) / Math.max(sum, 1e-6);
    return raw;
  }

  static biome(x: number, z: number): Biome { return Overworld.biomeOf(Overworld.weights(x, z)); }

  private static biomeOf(w: BiomeWeights): Biome {
    let best: Biome = 'grass', max = 0.5;
    for (const b of RING) if (w[b] > max) { max = w[b]; best = b; }
    return best;
  }

  /**
   * Quanto um ponto está dentro de um rio: 1 no meio da água, caindo a 0 no fim da margem.
   * Os rios são as curvas de nível do meio de um ruído torcido, então serpenteiam e se ramificam;
   * não passam pelo início nem pelo mar.
   */
  static river(x: number, z: number): number {
    const r = Math.hypot(x, z);
    if (r < Overworld.RIVER_FREE) return 0;
    const wx = x + (fbm3(x * 0.01, z * 0.01) - 0.5) * 60, wz = z + (fbm3(x * 0.01 + 7, z * 0.01 + 3) - 0.5) * 60;
    const v = fbm3(wx * 0.0045 + 3.7, wz * 0.0045 - 1.3);
    const d = Math.abs(v - 0.5) / 0.0025;                       // ~m até o meio do rio (gradiente médio do ruído)
    const fade = smoothstep(clamp01((r - Overworld.RIVER_FREE) / 30)) * (1 - smoothstep(clamp01((z - OVERWORLD.HALF * 0.55) / 40)));
    return fade * (1 - smoothstep(clamp01((d - Overworld.RIVER_WATER) / (Overworld.RIVER_BANK - Overworld.RIVER_WATER))));
  }

  private static hills(x: number, z: number): number {
    let h = (fbm(x * 0.018 + 11, z * 0.018 + 7) - 0.45) * 22; // colinas irregulares
    h += (fbm(x * 0.07, z * 0.07) - 0.5) * 2;                 // calombos
    const f = h / Overworld.TERRACE, i = Math.floor(f), fr = f - i;
    return (i + smoothstep(clamp01((fr - 0.72) / 0.28))) * Overworld.TERRACE + fr * 0.6; // platô + degrau
  }

  /** Altura de cada bioma; só é calculada onde o bioma tem peso (a maior parte do mapa tem um ou dois). */
  private static biomeHeight(b: Biome, x: number, z: number, hills: () => number): number {
    switch (b) {
      case 'grass': return hills() + 4;                   // base acima da água: lago só nos vales mais fundos
      case 'forest': return hills() * 1.25 + 5.5;
      case 'desert': return (Math.sin(x * 0.07 + Math.sin(z * 0.045) * 2.4) * 0.5 + 0.5) * 6 + fbm3(x * 0.02, z * 0.02) * 4;
      case 'ice': return Overworld.hills(x * 0.8 + 40, z * 0.8) * 1.4 + 8;
      case 'mountain': { // cristas pontudas: ruído "dobrado" ao quadrado
        const ridge = 1 - Math.abs(fbm(x * 0.011 + 5, z * 0.011 - 9) * 2 - 1);
        return ridge * ridge * 42 + hills() * 0.6 + 2;
      }
      case 'swamp': return OVERWORLD.SEA_Y + 0.25 + (fbm3(x * 0.06, z * 0.06) - 0.5) * 2.4; // poças onde fica abaixo da água
      case 'beach': return Math.max(-2.2, 1.2 - Math.max(0, z - OVERWORLD.HALF * 0.55) * 0.05 + (fbm3(x * 0.05, z * 0.05) - 0.5) * 1.2);
    }
  }

  static height(x: number, z: number): number { return Overworld.sample(x, z).h; }

  /** Altura, pesos dos biomas e quanto é rio num ponto, calculados juntos (para não repetir o ruído). */
  private static sample(x: number, z: number): { h: number; w: BiomeWeights; river: number } {
    const w = Overworld.weights(x, z), r = Math.hypot(x, z);
    let cached: number | undefined;
    const hills = (): number => (cached ??= Overworld.hills(x, z));
    let grass = 1, h = 0;
    for (const b of RING) if (w[b] > 0.001) { grass -= w[b]; h += Overworld.biomeHeight(b, x, z, hills) * w[b]; }
    if (grass > 0.001) h += Overworld.biomeHeight('grass', x, z, hills) * grass;
    if (r < 14) h = Overworld.START_Y + (h - Overworld.START_Y) * smoothstep(r / 14); // início plano, na altura base da grama
    const river = Overworld.river(x, z);
    if (river > 0) h += (Math.min(h, OVERWORLD.SEA_Y - 1.1) - h) * river; // cava o leito até abaixo da água
    const wall = Math.max(0, (Math.max(Math.abs(x), Math.abs(z)) - Overworld.WALL) * 0.8);
    return { h: h + (w.beach > 0.5 ? 0 : wall), w, river };   // paredão nas bordas, menos no mar
  }

  /**
   * Amostras numa grade de `n` x `n` pontos espaçados de `step` m a partir de (x0, z0), com uma borda
   * extra de 1 ponto em volta: a normal de cada ponto sai dos vizinhos da própria grade, sem novas
   * chamadas de ruído. Como a borda usa a mesma função, grades vizinhas batem na emenda.
   */
  private static grid(x0: number, z0: number, n: number, step: number): {
    at: (i: number, j: number) => { h: number; w: BiomeWeights; river: number };
    normal: (i: number, j: number) => THREE.Vector3;
  } {
    const side = n + 2, cells = new Array<{ h: number; w: BiomeWeights; river: number }>(side * side);
    for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) cells[(j + 1) * side + (i + 1)] = Overworld.sample(x0 + i * step, z0 + j * step);
    const at = (i: number, j: number): { h: number; w: BiomeWeights; river: number } => cells[(j + 1) * side + (i + 1)]!;
    return {
      at,
      normal: (i, j) => new THREE.Vector3(at(i - 1, j).h - at(i + 1, j).h, 2 * step, at(i, j - 1).h - at(i, j + 1).h).normalize(),
    };
  }

  /**
   * Ponto mais plano (menor diferença de altura num raio de `footprint` m) numa busca em grade de
   * até `search` m em volta de (x, z), fora do mar. Usado para assentar construções como as barracas.
   */
  static flattestNear(x: number, z: number, search = 12, footprint = 2.5): THREE.Vector3 {
    let best = new THREE.Vector3(x, 0, z), bestSpread = Infinity;
    for (let dx = -search; dx <= search; dx += 1.5) for (let dz = -search; dz <= search; dz += 1.5) {
      const cx = x + dx, cz = z + dz, ys: number[] = [];
      for (let a = 0; a < 8; a++) ys.push(Overworld.height(cx + Math.cos(a * Math.PI / 4) * footprint, cz + Math.sin(a * Math.PI / 4) * footprint));
      ys.push(Overworld.height(cx, cz));
      if (Math.min(...ys) < OVERWORLD.SEA_Y + 0.5) continue;
      const spread = Math.max(...ys) - Math.min(...ys) + Math.hypot(dx, dz) * 0.01; // empate: o mais perto do pedido
      if (spread < bestSpread) { bestSpread = spread; best = new THREE.Vector3(cx, 0, cz); }
    }
    return best;
  }

  static contains(x: number): boolean { return Math.abs(x) <= OVERWORLD.SIZE; }

  /** Um grupo por shard: liga/desliga a visibilidade de terreno + cenário daquele pedaço de uma vez. */
  readonly shards = new Map<ShardId, THREE.Group>();
  /** Shards de pé na largada (a até este raio, em shards, do início); o resto é montado aos poucos. */
  private static readonly EAGER_RADIUS = 2;
  /** Shards ainda vazios: montados um por quadro, sempre o mais perto do jogador primeiro. */
  private readonly pending: { coord: ShardCoord; group: THREE.Group }[] = [];
  private readonly terrain: THREE.Material;
  private readonly water: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly clock = new THREE.Clock();
  private readonly scenery: SceneryTextures;

  constructor(scene: THREE.Scene, assets: Assets, anisotropy: number, private readonly keepClear: THREE.Vector3[]) {
    this.terrain = Overworld.terrainMaterial(assets, anisotropy);
    this.scenery = Overworld.sceneryTextures(assets);
    const start = shardCoord(0, 0);
    for (const coord of allShards()) {
      const group = new THREE.Group();
      group.name = `shard ${shardId(coord)}`;
      this.shards.set(shardId(coord), group);
      scene.add(group);
      if (Math.max(Math.abs(coord.sx - start.sx), Math.abs(coord.sz - start.sz)) <= Overworld.EAGER_RADIUS) this.build(coord, group);
      else this.pending.push({ coord, group });
    }
    this.water = Overworld.buildWater();
    scene.add(this.water);
  }

  /** Monta terreno e cenário de um shard (mesmo resultado em qualquer ordem: a semente é a do shard). */
  private build(coord: ShardCoord, group: THREE.Group): void {
    const rng = seededRng(hashSeed(SHARD.WORLD_SEED, coord.sx, coord.sz));
    group.add(Overworld.buildTerrain(coord, this.terrain, rng));
    Overworld.scatterScenery(group, coord, this.scenery, this.keepClear, rng);
  }

  /** A cada quadro: monta o shard pendente mais perto de `focus`. */
  update(focus: THREE.Vector3): void {
    this.water.material.uniforms['time']!.value = this.clock.getElapsedTime() * 0.35; // ondinhas bem devagar
    if (!this.pending.length) return;
    const c = shardCoord(focus.x, focus.z);
    let best = 0, bestD = Infinity;
    this.pending.forEach((p, i) => {
      const d = Math.max(Math.abs(p.coord.sx - c.sx), Math.abs(p.coord.sz - c.sz));
      if (d < bestD) { bestD = d; best = i; }
    });
    const [next] = this.pending.splice(best, 1);
    this.build(next!.coord, next!.group);
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
vec3 grassTex = ground(ground0);
grassTex = mix(vec3(dot(grassTex, vec3(0.299, 0.587, 0.114))), grassTex, 1.3); // mais saturada: casa com o verde dos matinhos e árvores
diffuseColor.rgb *= (grassTex * vSplat.x * vec3(1.05, 1.5, 0.7) + ground(ground1) * vSplat.y * vec3(1.15, 1.0, 0.85) + ground(ground2) * vSplat.z * 1.1
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
    const step = SHARD.SIZE / seg, grid = Overworld.grid(origin.x, origin.y, seg + 1, step);
    for (let i = 0; i < pos.count; i++) {
      const gi = Math.round((pos.getX(i) - origin.x) / step), gj = Math.round((pos.getZ(i) - origin.y) / step);
      const { h: y, w, river } = grid.at(gi, gj), n = grid.normal(gi, gj);
      pos.setY(i, y);
      normals.set([n.x, n.y, n.z], i * 3);
      splat.set(Overworld.groundSplat(w, river, y, n.y), i * 4);
      // floresta e pântano mais escuros; chão encharcado perto da água
      shade[i] = (1 - w.forest * 0.18 - w.swamp * 0.3) * (y < OVERWORLD.SEA_Y + 0.4 ? 0.8 : 1) * (0.94 + rng() * 0.06);
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
    geo.setAttribute('shade', new THREE.BufferAttribute(shade, 1));
    geo.computeBoundingSphere();
    return new THREE.Mesh(geo, material);
  }

  /** Altura (m) a partir da qual o topo das montanhas fica nevado. */
  private static readonly SNOW_LINE = 17;

  /**
   * Quanto de cada foto de chão vai num vértice: [grama, terra, areia, neve] (rocha = o que falta para 1).
   * Grama/floresta planas com terra nas encostas; pântano meio lama; deserto e praia em areia; gelo em
   * neve; montanha em rocha, com grama no pé e neve no topo. Margem de rio puxa para areia.
   */
  private static groundSplat(w: BiomeWeights, river: number, y: number, ny: number): [number, number, number, number] {
    const steep = smoothstep(clamp01((0.86 - ny) / 0.14));
    const grassy = 1 - w.desert - w.ice - w.beach - w.mountain - w.swamp * 0.5;
    const foot = w.mountain * (1 - steep) * (1 - smoothstep(clamp01((y - 4) / 6)));     // pé da montanha
    const cap = w.mountain * smoothstep(clamp01((y - Overworld.SNOW_LINE) / 5)) * (1 - steep * 0.5);
    const out: [number, number, number, number] = [
      grassy * (1 - steep) + foot,
      grassy * steep + w.desert * steep * 0.6 + w.swamp * 0.5,
      w.desert * (1 - steep * 0.6) + w.beach,
      w.ice * (1 - steep) + cap,
    ];
    const bank = river * 0.85;
    if (bank > 0) { const to = [0, 0.3, 0.7, 0]; for (let k = 0; k < 4; k++) out[k] = out[k]! + (to[k]! - out[k]!) * bank; }
    return out;
  }

  /** Cor do chão no mapa: segue o bioma e a encosta (terra/rocha no íngreme), com areia na beira dos rios. */
  private static groundColor(w: BiomeWeights, river: number, y: number, ny: number): number {
    const steep = ny < 0.72, mid = ny < 0.85;
    if (river > 0.35 || y < OVERWORLD.SEA_Y + 0.4) return 0xd2b87e; // margem e areia molhada
    switch (Overworld.biomeOf(w)) {
      case 'grass': return steep ? (y % 1.3 < 0.65 ? 0xa57a4e : 0xb98a5a) : mid ? 0x7cb84a : 0x62bf3e;
      case 'forest': return steep ? 0x6b5a3a : mid ? 0x3f7a35 : 0x2f6e2a;
      case 'swamp': return mid ? 0x6b6a45 : 0x55663a;
      case 'mountain': return y > Overworld.SNOW_LINE ? 0xeef3f8 : steep ? 0x77726c : y < 6 ? 0x6f9a48 : 0x8f8a80;
      case 'desert': return steep ? 0xc0925a : mid ? 0xdcb978 : 0xebcf8e;
      case 'ice': return steep ? 0x8db6d8 : mid ? 0xcfe6f7 : 0xf2f9ff;
      case 'beach': return steep ? 0xc8ad74 : 0xf3e2a8;
    }
  }

  /**
   * Imagem do mapa (RGBA, `size` x `size`, um pixel a cada `metersPerPx` m a partir do canto -HALF):
   * a mesma cor de chão do terreno (bioma e encosta), com sombra de relevo vinda do noroeste; debaixo
   * d'água, a cor da água escurecendo com a profundidade. Usa uma grade só (rápido).
   */
  static mapPixels(size: number, metersPerPx: number): Uint8ClampedArray {
    const start = -OVERWORLD.HALF + metersPerPx / 2, grid = Overworld.grid(start, start, size, metersPerPx);
    const out = new Uint8ClampedArray(size * size * 4), sun = new THREE.Vector3(-0.5, 0.75, -0.45).normalize(), color = new THREE.Color();
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const { h, w, river } = grid.at(i, j);
      if (h < OVERWORLD.SEA_Y) color.set(Overworld.SEA_COLOR).offsetHSL(0, 0, -0.18 * Math.min(1, (OVERWORLD.SEA_Y - h) / 4));
      else {
        const n = grid.normal(i, j);
        color.set(Overworld.groundColor(w, river, h, n.y)).multiplyScalar(0.7 + 0.4 * n.dot(sun));
      }
      const hex = color.getHex(); // volta para sRGB (THREE.Color guarda em linear)
      out.set([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255], (j * size + i) * 4);
    }
    return out;
  }

  private static readonly SEA_COLOR = 0x3aa6d8;

  /** Há água aqui (mar, rio, poça do pântano ou lago): o chão está abaixo do nível da água. */
  static isWater(x: number, z: number): boolean { return Overworld.height(x, z) < OVERWORLD.SEA_Y; }

  /** Um plano de água só, no nível do mar, cobrindo o mapa: aparece onde o chão fica abaixo dele. */
  /** Metros por texel do mapa de profundidade da água. */
  private static readonly DEPTH_M_PER_PX = 3;

  /**
   * Água única no nível do mar. Shader próprio: cor pela profundidade (turquesa no raso, azul escuro no
   * fundo, transparente na beira), ondinhas animadas no normal e reflexo do céu por Fresnel.
   * A profundidade vem de uma textura assada do terreno.
   */
  private static buildWater(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    const n = Math.ceil(OVERWORLD.SIZE / Overworld.DEPTH_M_PER_PX), depth = new Uint16Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -OVERWORLD.HALF + (i + 0.5) * Overworld.DEPTH_M_PER_PX, z = -OVERWORLD.HALF + (j + 0.5) * Overworld.DEPTH_M_PER_PX;
      depth[j * n + i] = THREE.DataUtils.toHalfFloat(Math.min(1, Math.max(0, OVERWORLD.SEA_Y - Overworld.height(x, z)) / 3.5));
    }
    const depthTex = new THREE.DataTexture(depth, n, n, THREE.RedFormat, THREE.HalfFloatType);
    depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
    depthTex.needsUpdate = true;
    const material = new THREE.ShaderMaterial({
      transparent: true, fog: true, depthWrite: false,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        time: { value: 0 }, depthMap: { value: null }, mapSize: { value: OVERWORLD.SIZE },
        shallow: { value: new THREE.Color(0x2bb3b0) }, deep: { value: new THREE.Color(0x0b3f78) }, sky: { value: new THREE.Color(0xbfe4ff) },
      }]),
      vertexShader: `#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `#include <common>
#include <fog_pars_fragment>
uniform float time, mapSize;
uniform sampler2D depthMap;
uniform vec3 shallow, deep, sky;
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xz;
  // ondinhas: soma de senos em direções diferentes vira a inclinação do normal
  vec2 slope = vec2(0.0);
  vec2 dirs[4]; dirs[0] = normalize(vec2(1.0, 0.3)); dirs[1] = normalize(vec2(-0.4, 1.0)); dirs[2] = normalize(vec2(0.7, -0.8)); dirs[3] = normalize(vec2(-1.0, -0.2));
  float freqs[4]; freqs[0] = 0.55; freqs[1] = 0.8; freqs[2] = 1.7; freqs[3] = 2.6;
  for (int k = 0; k < 4; k++) slope += dirs[k] * cos(dot(p, dirs[k]) * freqs[k] + time * (1.0 + float(k) * 0.4)) * (0.09 / (1.0 + float(k)));
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 view = normalize(cameraPosition - vWorld);

  float d = texture2D(depthMap, (p + mapSize * 0.5) / mapSize).r;
  d = (p.x < -mapSize * 0.5 || p.x > mapSize * 0.5 || p.y < -mapSize * 0.5 || p.y > mapSize * 0.5) ? 1.0 : d;
  vec3 col = mix(shallow, deep, smoothstep(0.0, 0.7, d));
  float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 4.0);
  col = mix(col, sky, fresnel * 0.25);
  float alpha = mix(0.55, 0.92, smoothstep(0.0, 0.5, d)) + fresnel * 0.08;
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  #include <fog_fragment>
}`,
    });
    material.uniforms['depthMap']!.value = depthTex;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(OVERWORLD.SIZE * 1.6, OVERWORLD.SIZE * 1.6), material);
    water.rotation.x = -Math.PI / 2;
    water.position.y = OVERWORLD.SEA_Y;
    return water;
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
      if (Math.hypot(x, z) < 6 || keepClear.some((c) => Math.hypot(x - c.x, z - c.z) < 5)) continue;
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
        case 'forest': // mata fechada: árvores altas, quase sempre em dupla, e arbustos
          if (r < 0.7) {
            for (let t = 0; t < 2; t++) {
              const tx = x + (t ? rngRange(rng, -4, 4) : 0), tz = z + (t ? rngRange(rng, -4, 4) : 0), k = rngRange(rng, 7, 10);
              if (Overworld.height(tx, tz) > OVERWORLD.SEA_Y + 0.3) add(rngPick(rng, r < 0.6 ? v.tree : v.pink), k * 0.8, k, tx, tz);
            }
          } else if (r < 0.9) add(rngPick(rng, v.bush), 2.4, 1.6, x, z);
          else add(rngPick(rng, v.flower), 0.6, 1, x, z);
          break;
        case 'mountain': { // pinheiros no pé, só pedra lá em cima
          const y = Overworld.height(x, z);
          if (y < 10 && r < 0.45) { const k = rngRange(rng, 5, 7.5); add(rngPick(rng, v.pine), k * 0.67, k, x, z); }
          else if (r < 0.7) add(rngPick(rng, y > Overworld.SNOW_LINE ? v.iceRock : v.sandRock), 2.2, 1.6, x, z);
          break;
        }
        case 'swamp': // árvores baixas e galhos secos entre as poças
          if (r < 0.25) { const k = rngRange(rng, 4, 5.5); add(rngPick(rng, v.tree), k * 0.8, k, x, z); }
          else if (r < 0.55) add(rngPick(rng, v.deadBush), 2, 1.25, x, z);
          else if (r < 0.8) add(rngPick(rng, v.bush), 2.2, 1.4, x, z);
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
      const b = Overworld.biome(p.x, p.z);
      if (y > 12 || y < OVERWORLD.SEA_Y + 0.2 || (b !== 'grass' && b !== 'forest' && b !== 'swamp')) continue;
      const t = new THREE.Sprite(v.tuft);
      t.scale.set(k, k * 0.75, 1); t.center.set(0.5, 0); t.position.set(p.x, y - 0.05, p.z);
      group.add(t);
    }
  }
}
