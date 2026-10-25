import * as THREE from 'three';
import { Billboard } from '../../engine/Billboard';
import { SpriteSheet } from '../../engine/SpriteSheet';
import { flatDistance } from '../../engine/math';
import type { Game } from '../Game';
import { Entity, type Hittable } from './Entity';

/** Corte da espada como projétil: nasce colado no jogador (acerta de perto) e voa um pouco. */
export class SlashProjectile extends Entity {
  private static readonly SPEED = 14;
  private static readonly LIFE = 0.3;
  private life = SlashProjectile.LIFE;
  private readonly pos: THREE.Vector3;
  private readonly hit = new Set<Hittable>();
  private readonly sheet: SpriteSheet;
  private readonly sprite: Billboard;

  constructor(game: Game, from: THREE.Vector3, private readonly dir: THREE.Vector3, private readonly row: number) {
    super(game);
    this.pos = from.clone().addScaledVector(dir, 0.6);
    this.sheet = new SpriteSheet(game.assets.texture('slash'), 5, 4);
    this.sprite = new Billboard(game.scene, this.sheet.texture, 2.2, 2.2, 0.5);
  }

  update(dt: number): void {
    this.life -= dt;
    this.pos.addScaledVector(this.dir, SlashProjectile.SPEED * dt);
    this.sprite.position.set(this.pos.x, this.pos.y + 1.1, this.pos.z);
    this.sheet.setProgress(this.row, 1 - this.life / SlashProjectile.LIFE, 5);
    for (const target of this.game.hittables()) {
      if (this.hit.has(target) || !target.canBeHit) continue;
      if (flatDistance(target.pos, this.pos) < target.hitRadius && Math.abs(target.pos.y - this.pos.y) < 1.6) {
        this.hit.add(target);
        target.takeHit(this.dir);
      }
    }
    if (this.life <= 0) this.alive = false;
  }

  dispose(): void { this.sprite.dispose(); this.sheet.dispose(); }
}
