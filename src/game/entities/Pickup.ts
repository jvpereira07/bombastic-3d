import * as THREE from 'three';
import { Billboard } from '../../engine/Billboard';
import { flatDistance } from '../../engine/math';
import type { Game } from '../Game';
import { ITEMS, type ItemId } from '../items/items';
import { Entity } from './Entity';

/** Item no chão: flutua e é pego ao encostar. Equipamentos ganham um brilho dourado. */
export class Pickup extends Entity {
  private readonly pos: THREE.Vector3;
  private readonly sprite: Billboard;
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null;
  private t = Math.random() * 6;

  constructor(game: Game, readonly item: ItemId, x: number, z: number) {
    super(game);
    const def = ITEMS[item], size = def.kind === 'equipment' ? 1.6 : 1.1;
    this.pos = new THREE.Vector3(x, game.world.groundAt(x, z), z);
    this.sprite = new Billboard(game.scene, game.assets.pixel(def.icon), size, size);
    if (def.kind === 'equipment') {
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.copy(this.pos).y += 0.06;
      game.scene.add(this.ring);
    }
  }

  get position(): THREE.Vector3 { return this.pos; }

  update(dt: number): void {
    this.t += dt;
    this.sprite.position.set(this.pos.x, this.pos.y + 0.3 + Math.sin(this.t * 3) * 0.15, this.pos.z);
    if (this.ring) this.ring.material.opacity = 0.4 + Math.sin(this.t * 4) * 0.3;
    const player = this.game.player;
    if (player.dead || flatDistance(player.pos, this.pos) > 1.3 || Math.abs(player.pos.y - this.pos.y) > 2) return;
    if (player.collect(this.item)) this.alive = false;
  }

  dispose(): void {
    this.sprite.dispose();
    if (this.ring) { this.game.scene.remove(this.ring); this.ring.geometry.dispose(); this.ring.material.dispose(); }
  }
}
