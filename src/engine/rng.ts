/** Gerador pseudoaleatório com semente (mulberry32): a mesma semente dá a mesma sequência em qualquer máquina. */
export type Rng = () => number;

export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semente estável a partir de inteiros (ex.: coordenadas de um shard e a semente do mundo). */
export function hashSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) { h ^= p | 0; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const rngRange = (rng: Rng, a: number, b: number): number => a + rng() * (b - a);

export function rngPick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error('rngPick() em lista vazia');
  return item;
}
