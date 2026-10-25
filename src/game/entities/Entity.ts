import type * as THREE from 'three';
import type { Game } from '../Game';

/** Tudo que vive no mundo e é atualizado a cada frame. `alive = false` remove na próxima limpeza. */
export abstract class Entity {
  alive = true;
  constructor(protected readonly game: Game) {}
  abstract update(dt: number): void;
  dispose(): void { /* subclasses liberam sprites e texturas */ }
}

/** Pode ser atingido pelo corte do jogador. */
export interface Hittable {
  readonly pos: THREE.Vector3;
  readonly hitRadius: number;
  readonly canBeHit: boolean;
  takeHit(direction: THREE.Vector3): void;
}
