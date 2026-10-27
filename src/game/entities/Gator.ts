import * as THREE from 'three';
import { SpriteSheet } from '../../engine/SpriteSheet';
import { facingRow } from '../../engine/math';
import { GATOR } from '../config';
import type { Game } from '../Game';
import { Actor } from './Actor';
import { Spit } from './Spit';

/** Linhas de parado e colunas do cuspe (linha 5) na folha do pygame, na ordem costas, esquerda, frente, direita. */
const IDLE_ROW = [3, 1, 2, 0] as const;
const SPIT_COL = [15, 10, 5, 0] as const;
const SPIT_ROW = 5;
const SPIT_FRAMES = 5;

/** Jacaré: fica parado no rio, meio afundado, e cospe no jogador quando ele chega perto. */
export class Gator extends Actor {
  readonly hitRadius = 1.6;
  readonly netKind = 'gator';
  private readonly sheet: SpriteSheet;
  private cooldown = GATOR.SPIT_COOLDOWN * Math.random();
  private spitTime = -1;
  private spitFired = false;
  private anim = Math.random() * 4;
  private dying = 0;
  /** Onde mira o próximo cuspe (o jogador mais perto, local ou remoto). */
  private readonly aim = new THREE.Vector3();

  constructor(game: Game, x: number, z: number) {
    const sheet = new SpriteSheet(game.assets.texture('gator'), 20, 6);
    super(game, x, z, GATOR.HP, [sheet], 3.2, 0.3); // âncora alta: a parte de baixo fica sob a água
    this.sheet = sheet;
  }

  get canBeHit(): boolean { return super.canBeHit && this.dying <= 0; }

  /** Não sai do lugar com o golpe; só sente o dano. */
  takeHit(direction: THREE.Vector3, damage = 1): void {
    if (this.forwardHit(direction)) return;
    this.hp -= damage; this.hurtTimer = 0.15;
    this.game.sfx.hit();
    if (this.hp <= 0) { this.dying = 0.5; this.game.dropCoins('gator', this.pos.x, this.pos.z); }
  }

  kill(): void { this.alive = false; }

  update(dt: number): void {
    this.hurtTimer -= dt; this.cooldown -= dt; this.anim += dt * 4;
    if (this.dying > 0) {
      this.dying -= dt; this.body.sprite.scale.y *= 0.9;
      if (this.dying <= 0) this.alive = false;
      return;
    }
    const player = this.game.nearestTarget(this.pos);
    this.aim.copy(player.pos);
    const toPlayer = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const sees = !player.dead && this.game.world.sameZone(this.pos, player.pos) && toPlayer.length() < GATOR.SIGHT;
    if (sees) this.look.set(toPlayer.x, toPlayer.z).normalize();
    this.focus(sees, dt);

    if (this.spitTime >= 0) {
      this.spitTime += dt;
      if (!this.spitFired && this.spitTime >= GATOR.SPIT_WINDUP) { this.spitFired = true; this.spit(); }
      if (this.spitTime >= GATOR.SPIT_ANIM) this.spitTime = -1;
    } else if (sees && this.cooldown <= 0 && !this.reacting) {
      this.spitTime = 0; this.spitFired = false; this.cooldown = GATOR.SPIT_COOLDOWN;
    }

    if (this.spitTime >= 0) { this.poseS = 1; this.poseC = Math.min(SPIT_FRAMES - 1, Math.floor(this.spitTime / GATOR.SPIT_ANIM * SPIT_FRAMES)); }
    else { this.poseS = 0; this.poseC = Math.floor(this.anim) % 4; }
    this.applyPose(this.poseS, this.poseC, facingRow(this.look.x, this.look.y, this.game.camera.yaw));
    this.syncSprite();
  }

  protected applyPose(s: number, c: number, facing: number): void {
    if (s === 1) this.sheet.setFrame(SPIT_ROW, SPIT_COL[facing]! + c);
    else this.sheet.setFrame(IDLE_ROW[facing]!, c);
  }

  private spit(): void {
    const mouth = this.pos.clone().setY(this.pos.y + 0.6);
    const target = this.aim.clone().setY(this.aim.y + 0.9);
    const dir = target.sub(mouth).normalize();
    this.game.spawn(new Spit(this.game, mouth.addScaledVector(dir, 1.2), dir));
    this.game.sfx.squeak();
  }
}
