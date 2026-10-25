import * as THREE from 'three';
import { Billboard } from '../../engine/Billboard';
import { GATOR } from '../config';
import type { Game } from '../Game';
import { Entity } from './Entity';

/** Cuspe do jacaré: voa reto até acertar o jogador ou sumir. */
export class Spit extends Entity {
  private life = GATOR.SPIT_LIFE;
  private readonly sprite: Billboard;

  constructor(game: Game, private readonly pos: THREE.Vector3, private readonly dir: THREE.Vector3) {
    super(game);
    this.sprite = new Billboard(game.scene, game.assets.pixel('spit'), 0.9, 0.9, 0.5);
    this.sprite.position.copy(pos);
  }

  update(dt: number): void {
    this.life -= dt;
    this.pos.addScaledVector(this.dir, GATOR.SPIT_SPEED * dt);
    this.sprite.position.copy(this.pos);
    for (const target of this.game.targets()) {
      if (target.dead || this.pos.distanceTo(target.pos.clone().setY(target.pos.y + 0.9)) >= 0.9) continue;
      target.hurt(GATOR.DAMAGE, this.dir);
      this.alive = false;
      return;
    }
    if (this.life <= 0 || this.pos.y < this.game.world.groundAt(this.pos.x, this.pos.z) - 0.5) this.alive = false;
  }

  dispose(): void { this.sprite.material.map?.dispose(); this.sprite.dispose(); }
}
