import { Billboard } from '../../engine/Billboard';
import { SpriteSheet } from '../../engine/SpriteSheet';
import { rnd } from '../../engine/math';
import { SEWER } from '../config';
import type { Game } from '../Game';
import { Entity } from '../entities/Entity';
import { Paratrooper } from './Paratrooper';

/** Avião de ratos (Rato_Avião): cruza a arena e solta 3 paraquedistas. */
export class RatPlane extends Entity {
  private static readonly SPEED = 11;
  private static readonly ALTITUDE = 8.5;
  private x: number;
  private readonly z: number;
  private readonly velocity: number;
  private readonly drops: number[];
  private anim = 0;
  private readonly sheet: SpriteSheet;
  private readonly sprite: Billboard;

  constructor(game: Game) {
    super(game);
    const { SX, SW, SL, AL } = SEWER, fromLeft = Math.random() < 0.5;
    this.z = rnd(SL + 6, SL + AL - 6);
    this.x = fromLeft ? SX - SW - 6 : SX + SW + 6;
    this.velocity = fromLeft ? RatPlane.SPEED : -RatPlane.SPEED;
    this.drops = [rnd(-10, -3), rnd(-3, 3), rnd(3, 10)].map((dx) => SX + dx);
    this.sheet = new SpriteSheet(game.assets.texture('plane'), 2, 1);
    this.sprite = new Billboard(game.scene, this.sheet.texture, 5.2, 3.9, 0.5);
  }

  update(dt: number): void {
    this.x += this.velocity * dt;
    this.anim += dt * 12;
    this.sheet.setFrame(0, Math.floor(this.anim) % 2, this.velocity > 0); // o desenho olha para a esquerda
    this.sprite.position.set(this.x, RatPlane.ALTITUDE, this.z);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const dropX = this.drops[i]!;
      if ((this.velocity > 0 && this.x >= dropX) || (this.velocity < 0 && this.x <= dropX)) {
        this.game.spawn(new Paratrooper(this.game, this.x, this.z));
        this.drops.splice(i, 1);
      }
    }
    if (Math.abs(this.x - SEWER.SX) > SEWER.SW + 8) this.alive = false;
  }

  dispose(): void { this.sprite.dispose(); this.sheet.dispose(); }
}
