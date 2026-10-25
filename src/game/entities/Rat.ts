import * as THREE from 'three';
import { SpriteSheet } from '../../engine/SpriteSheet';
import { rnd } from '../../engine/math';
import { RAT } from '../config';
import type { Game } from '../Game';
import { Actor } from './Actor';

type RatState = 'wander' | 'chase' | 'pounce';

/** Rato do projeto: passeia, persegue quem chega a 20 m e dá o bote pulando. */
export class Rat extends Actor {
  readonly hitRadius = 1.3;
  readonly netKind = 'rat';
  private state: RatState;
  private wanderTimer = 0;
  private readonly wanderDir = new THREE.Vector2();
  private pounceCooldown = 0;
  private pounceTime = 0;
  private pounceLanded = false;
  private anim = 0;
  private dying = 0;
  private readonly walk: SpriteSheet;
  private readonly attack: SpriteSheet;

  constructor(game: Game, x: number, z: number, readonly minion = false) {
    const walk = new SpriteSheet(game.assets.texture('rat_walk'), 5, 4);
    const attack = new SpriteSheet(game.assets.texture('rat_atk'), 6, 4);
    super(game, x, z, RAT.HP, [walk, attack], 2, 0.08);
    this.walk = walk; this.attack = attack;
    this.state = minion ? 'chase' : 'wander';
  }

  get canBeHit(): boolean { return super.canBeHit && this.dying <= 0; }

  get minionFlag(): boolean { return this.minion; }

  takeHit(direction: THREE.Vector3): void {
    if (this.forwardHit(direction)) return;
    this.hp--; this.hurtTimer = 0.15; this.state = 'chase';
    this.vy = 7; this.knockback.copy(direction).setY(0);
    this.game.sfx.hit();
    if (this.hp <= 0) {
      this.dying = 0.4;
      if (Math.random() < RAT.POTION_DROP) this.game.dropItem('potion', this.pos.x, this.pos.z);
    }
  }

  /** Morre sem deixar item nem renascer (usado quando o chefe limpa a arena). */
  kill(): void { this.dying = 0.4; this.hp = 0; }

  update(dt: number): void {
    const player = this.game.nearestTarget(this.pos);
    this.hurtTimer -= dt; this.wanderTimer -= dt; this.pounceCooldown -= dt;
    if (this.dying > 0) {
      this.dying -= dt; this.body.sprite.scale.y *= 0.9;
      if (this.dying <= 0) { this.alive = false; if (!this.minion) this.game.spawner.scheduleRespawn(this.game.world.zoneOf(this.pos)); }
      return;
    }
    const toPlayer = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = toPlayer.length(); toPlayer.normalize();
    const canSee = !player.dead && this.game.world.sameZone(this.pos, player.pos);

    if (!canSee) this.state = 'wander';
    else if (this.state === 'wander' && dist < RAT.SIGHT) this.state = 'chase';
    else if (this.state === 'chase' && dist > RAT.LOSE && !this.minion) this.state = 'wander';

    const grounded = this.onGround;
    if (this.state === 'pounce') {
      if (!this.pounceLanded && dist < 1.3 && Math.abs(player.pos.y - this.pos.y) < 1.5 && !player.dead) {
        this.pounceLanded = true; player.hurt(RAT.DAMAGE, toPlayer);
      }
      if (grounded && this.vy <= 0) { this.state = 'chase'; this.vel.set(0, 0, 0); }
    } else if (this.state === 'chase') {
      if (dist < RAT.POUNCE_RANGE && this.pounceCooldown <= 0 && grounded) {
        this.state = 'pounce'; this.pounceTime = 0; this.pounceCooldown = RAT.POUNCE_COOLDOWN; this.pounceLanded = false;
        this.vy = 7; this.vel.copy(toPlayer).multiplyScalar(dist * 2.2 + 2);
        this.game.sfx.squeak();
      } else this.vel.copy(toPlayer).multiplyScalar(dist > 1.4 ? 6.5 : 0);
    } else {
      if (this.wanderTimer <= 0) {
        this.wanderTimer = rnd(1.5, 4);
        const a = Math.random() * Math.PI * 2;
        this.wanderDir.set(Math.cos(a), Math.sin(a)).multiplyScalar(Math.random() < 0.6 ? 2 : 0);
      }
      this.vel.set(this.wanderDir.x, 0, this.wanderDir.y);
    }
    if (this.knockback.lengthSq() > 4) this.vel.set(0, 0, 0); // voando do golpe, não anda
    this.integrate(dt);
    this.animate(dt);
  }

  private animate(dt: number): void {
    const row = this.facing();
    if (this.state === 'pounce') {
      this.pounceTime += dt;
      this.poseS = 1; this.poseC = Math.min(5, Math.floor(this.pounceTime * 12));
    } else {
      this.anim += dt * (this.vel.lengthSq() > 0.1 ? 12 : 0);
      this.poseS = 0; this.poseC = Math.floor(this.anim) % 5;
    }
    this.applyPose(this.poseS, this.poseC, row);
    this.syncSprite();
  }

  protected applyPose(s: number, c: number, facing: number): void {
    const sheet = s === 1 ? this.attack : this.walk;
    this.body.setMap(sheet.texture);
    sheet.setFrame(facing, c);
  }
}
