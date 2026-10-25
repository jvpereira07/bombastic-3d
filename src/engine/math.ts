import * as THREE from 'three';

export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) throw new Error('pick() em lista vazia');
  return item;
}

/** Suavização independente de FPS: fração a andar neste frame para uma taxa `rate`. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/**
 * Linha da folha de sprites para uma direção no mundo, vista pela câmera.
 * Ordem das linhas em todas as folhas: 0 costas, 1 esquerda, 2 frente, 3 direita.
 */
export function facingRow(dirX: number, dirZ: number, cameraYaw: number): number {
  const c = Math.cos(cameraYaw), s = Math.sin(cameraYaw);
  const lx = dirX * c - dirZ * s, lz = dirX * s + dirZ * c;
  if (Math.abs(lz) >= Math.abs(lx)) return lz < 0 ? 0 : 2;
  return lx < 0 ? 1 : 3;
}

/** Vetor "direita" da câmera no plano XZ. */
export const cameraRight = (cameraYaw: number): THREE.Vector3 =>
  new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));

export const flatDistance = (a: THREE.Vector3, b: THREE.Vector3): number => Math.hypot(a.x - b.x, a.z - b.z);
