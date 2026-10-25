import type * as THREE from 'three';
import { SHARD, shardAt, shardsAround, type ShardId } from './shards';

type ShardListener = (id: ShardId) => void;

/**
 * Decide, a cada troca de shard do jogador, o que é desenhado e o que é simulado:
 * - vista: shards até VIEW_RADIUS ficam visíveis; os outros somem da cena (menos draw calls);
 * - simulação: entidades fora de SIM_RADIUS ficam congeladas até alguém chegar perto;
 * - interesse: avisa quando um shard entra/sai do raio de simulação. No multiplayer é aqui que o
 *   cliente assina/cancela o canal daquele shard (só recebe estado de quem está por perto).
 */
export class ShardManager {
  private current: ShardId | null = null;
  private view = new Set<ShardId>();
  private sim = new Set<ShardId>();
  private readonly enterListeners: ShardListener[] = [];
  private readonly leaveListeners: ShardListener[] = [];

  constructor(private readonly groups: ReadonlyMap<ShardId, THREE.Object3D>) {}

  get playerShard(): ShardId | null { return this.current; }
  get visible(): ReadonlySet<ShardId> { return this.view; }
  get simulated(): ReadonlySet<ShardId> { return this.sim; }

  onEnter(listener: ShardListener): void { this.enterListeners.push(listener); }
  onLeave(listener: ShardListener): void { this.leaveListeners.push(listener); }

  /** Entidades sem posição (projéteis, efeitos curtos) sempre simulam. */
  simulates(pos: THREE.Vector3 | null): boolean { return !pos || this.sim.has(shardAt(pos.x, pos.z)); }

  update(focus: THREE.Vector3): void {
    const id = shardAt(focus.x, focus.z);
    if (id === this.current) return;
    this.current = id;

    this.view = shardsAround(focus.x, focus.z, SHARD.VIEW_RADIUS);
    for (const [shard, group] of this.groups) group.visible = this.view.has(shard);

    const next = shardsAround(focus.x, focus.z, SHARD.SIM_RADIUS);
    for (const s of this.sim) if (!next.has(s)) for (const l of this.leaveListeners) l(s);
    for (const s of next) if (!this.sim.has(s)) for (const l of this.enterListeners) l(s);
    this.sim = next;
  }
}
