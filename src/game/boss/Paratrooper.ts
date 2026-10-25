import { Billboard } from '../../engine/Billboard';
import { SpriteSheet } from '../../engine/SpriteSheet';
import type { Game } from '../Game';
import { BombRat } from '../entities/BombRat';
import { Entity } from '../entities/Entity';

/** Rato de paraquedas: desce balançando e, ao pousar, vira um rato-bomba (é o mesmo rato de mochila). */
export class Paratrooper extends Entity {
  private static readonly FALL_SPEED = 2.6;
  private y = 7.5;
  private anim = Math.random() * 4;
  private readonly sheet: SpriteSheet;
  private readonly sprite: Billboard;

  constructor(game: Game, private readonly x: number, private readonly z: number) {
    super(game);
    this.sheet = new SpriteSheet(game.assets.texture('para'), 4, 2);
    this.sprite = new Billboard(game.scene, this.sheet.texture, 2.4, 2.4);
  }

  update(dt: number): void {
    this.y -= Paratrooper.FALL_SPEED * dt;
    this.anim += dt * 8;
    this.sheet.setFrame(0, Math.floor(this.anim) % 4);
    this.sprite.position.set(this.x + Math.sin(this.anim) * 0.3, this.y, this.z);
    if (this.y <= 0) {
      this.alive = false;
      this.game.spawn(new BombRat(this.game, this.x, this.z, true));
    }
  }

  dispose(): void { this.sprite.dispose(); this.sheet.dispose(); }
}
