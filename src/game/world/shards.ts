import * as THREE from 'three';
import { OVERWORLD, SEWER } from '../config';

/**
 * Shard = pedaço quadrado do mundo com id estável. É a unidade de:
 * - geração: terreno e cenário de cada shard saem só da semente do mundo + coordenadas (mesmo resultado em todo cliente);
 * - otimização: só os shards perto do jogador são desenhados e só os mais perto ainda simulam entidades;
 * - multiplayer: cada shard pode ter um dono (servidor/host) e cada cliente só assina os shards de interesse.
 * O esgoto é um shard à parte (instância), fora da grade.
 */
export type ShardId = string;

export const SHARD = {
  SIZE: 55,                                  // 770 m / 14 shards por lado
  PER_SIDE: Math.round(OVERWORLD.SIZE / 55),
  WORLD_SEED: 0xb0b5,
  VIEW_RADIUS: 4,                            // shards desenhados em volta do jogador (anel de Chebyshev)
  SIM_RADIUS: 2,                             // shards cujas entidades continuam simulando
  SEWER: 'sewer' as ShardId,
} as const;

export interface ShardCoord { sx: number; sz: number }

export const shardId = (c: ShardCoord): ShardId => `${c.sx},${c.sz}`;

/** Coordenada de shard de um ponto; o esgoto (x muito à direita) tem id próprio. */
export function shardAt(x: number, z: number): ShardId {
  if (x > SEWER.SX / 2) return SHARD.SEWER;
  return shardId(shardCoord(x, z));
}

export function shardCoord(x: number, z: number): ShardCoord {
  const half = SHARD.PER_SIDE / 2, max = SHARD.PER_SIDE - 1;
  const clampI = (v: number): number => Math.min(max, Math.max(0, v));
  return { sx: clampI(Math.floor(x / SHARD.SIZE + half)), sz: clampI(Math.floor(z / SHARD.SIZE + half)) };
}

/** Canto mínimo (x, z) do shard no mundo. */
export function shardOrigin(c: ShardCoord): THREE.Vector2 {
  const half = SHARD.PER_SIDE / 2;
  return new THREE.Vector2((c.sx - half) * SHARD.SIZE, (c.sz - half) * SHARD.SIZE);
}

/** Todos os shards da grade da superfície. */
export function allShards(): ShardCoord[] {
  const out: ShardCoord[] = [];
  for (let sz = 0; sz < SHARD.PER_SIDE; sz++) for (let sx = 0; sx < SHARD.PER_SIDE; sx++) out.push({ sx, sz });
  return out;
}

/** Shards a até `radius` de distância (em shards) de um ponto; no esgoto, só ele. */
export function shardsAround(x: number, z: number, radius: number): Set<ShardId> {
  const center = shardAt(x, z);
  if (center === SHARD.SEWER) return new Set([SHARD.SEWER]);
  const c = shardCoord(x, z), out = new Set<ShardId>();
  for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
    const sx = c.sx + dx, sz = c.sz + dz;
    if (sx >= 0 && sz >= 0 && sx < SHARD.PER_SIDE && sz < SHARD.PER_SIDE) out.add(shardId({ sx, sz }));
  }
  return out;
}
