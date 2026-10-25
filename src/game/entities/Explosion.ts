import type * as THREE from 'three';
import { Billboard } from '../../engine/Billboard';
import { SpriteSheet } from '../../engine/SpriteSheet';
import type { Game } from '../Game';
import { Entity } from './Entity';

/** Explosão do projeto (9 quadros de 64 px) com dano em área nos jogadores; a que veio da rede é só visual. */
export class Explosion extends Entity {
  private static readonly LIFE = 0.6;
  private static readonly RADIUS = 2.8;
  private static readonly DAMAGE = 22;
  private life = Explosion.LIFE;
  private readonly sheet: SpriteSheet;
  private readonly sprite: Billboard;

  constructor(game: Game, at: THREE.Vector3, damages = true) {
    super(game);
    this.sheet = new SpriteSheet(game.assets.texture('boom'), 9, 1);
    this.sprite = new Billboard(game.scene, this.sheet.texture, 4.5, 4.5, 0.2);
    this.sprite.position.copy(at);
    game.sfx.boom();
    if (!damages) return;
    for (const target of game.targets()) {
      if (target.dead || at.distanceTo(target.pos) >= Explosion.RADIUS) continue;
      const push = target.pos.clone().sub(at); push.y = 0;
      target.hurt(Explosion.DAMAGE, push.normalize());
    }
  }

  update(dt: number): void {
    this.life -= dt;
    this.sheet.setProgress(0, 1 - this.life / Explosion.LIFE, 9);
    if (this.life <= 0) this.alive = false;
  }

  dispose(): void { this.sprite.dispose(); this.sheet.dispose(); }
}
