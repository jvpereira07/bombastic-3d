import type * as THREE from 'three';
import { SpriteSheet } from '../../engine/SpriteSheet';
import type { Game } from '../Game';
import { Actor } from './Actor';

/** Rato-bomba: corre direto para o jogador, acende o pavio perto dele e explode. */
export class BombRat extends Actor {
  readonly hitRadius = 1.3;
  readonly netKind = 'bomb';
  private fuse = 0;
  private anim = 0;
  private readonly walk: SpriteSheet;
  private static readonly SPEED = 7.5;
  private static readonly FUSE = 0.45;

  constructor(game: Game, x: number, z: number, readonly minion = true) {
    const walk = new SpriteSheet(game.assets.texture('bomb'), 5, 4);
    super(game, x, z, 1, [walk], 2, 0.08);
    this.walk = walk;
  }

  /** Golpe faz explodir na hora. */
  takeHit(direction: THREE.Vector3): void {
    if (this.forwardHit(direction)) return;
    this.game.sfx.hit(); this.detonate();
  }

  get minionFlag(): boolean { return this.minion; }

  protected applyPose(_s: number, c: number, facing: number): void { this.walk.setFrame(facing, c); }

  kill(): void { this.alive = false; }

  update(dt: number): void {
    const player = this.game.nearestTarget(this.pos);
    this.hurtTimer -= dt;
    if (this.fuse > 0) {
      this.fuse -= dt;
      this.body.tint(Math.floor(this.fuse * 16) % 2 ? 0xff4040 : 0xffffff);
      if (this.fuse <= 0) this.detonate();
      return;
    }
    const chasing = !player.dead && this.game.world.sameZone(this.pos, player.pos);
    this.focus(chasing, dt);
    if (chasing && !this.reacting) {
      this.vel.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
      if (this.vel.length() < 1.6) { this.fuse = BombRat.FUSE; this.vel.set(0, 0, 0); }
      else this.vel.normalize().multiplyScalar(BombRat.SPEED);
    } else this.vel.set(0, 0, 0);
    this.integrate(dt);
    this.anim += dt * 14;
    this.poseC = Math.floor(this.anim) % 5;
    this.applyPose(0, this.poseC, this.facing());
    this.syncSprite();
  }

  private detonate(): void {
    if (!this.alive) return;
    this.alive = false; this.hp = 0;
    this.game.explode(this.pos);
  }
}
