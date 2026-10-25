import type * as THREE from 'three';
import type { Game } from '../Game';

/** Tudo que vive no mundo e é atualizado a cada frame. `alive = false` remove na próxima limpeza. */
export abstract class Entity {
  alive = true;
  constructor(protected readonly game: Game) {}
  abstract update(dt: number): void;
  /** Onde está, para saber em que shard simula; null = sempre simula (projéteis, efeitos curtos). */
  get position(): THREE.Vector3 | null { return null; }
  dispose(): void { /* subclasses liberam sprites e texturas */ }
}

/** Pode ser atingido pelo corte do jogador. */
export interface Hittable {
  readonly pos: THREE.Vector3;
  readonly hitRadius: number;
  readonly canBeHit: boolean;
  /** `damage` padrão 1; o golpe final do combo dá mais. */
  takeHit(direction: THREE.Vector3, damage?: number): void;
}
