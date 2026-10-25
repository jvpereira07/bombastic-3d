import * as THREE from 'three';
import { SpriteSheet } from '../../engine/SpriteSheet';
import { flatDistance } from '../../engine/math';
import { BOSS } from '../config';
import type { Game } from '../Game';
import { Actor } from '../entities/Actor';
import { BombRat } from '../entities/BombRat';
import { MusicNote } from './MusicNote';
import { RatPlane } from './RatPlane';
import { SpeakerLaser } from './SpeakerLaser';

type BossState = 'idle' | 'fight' | 'dead';

/** Linhas da folha (19 x 9 quadros de 112x128): 0 parado, 1 direita, 2 esquerda, 3 puxa a caixa, 4 toca, 5 ataque, 6-8 morte. */
const ANIM = { IDLE: 0, RIGHT: 1, LEFT: 2, SPEAKER_OUT: 3, SPEAKER_PLAY: 4, ATTACK: 5 } as const;
const DEATH_FRAMES: [number, number][] = [[6, 19], [7, 12], [8, 11]]
  .flatMap(([row = 0, n = 0]) => Array.from({ length: n }, (_, col): [number, number] => [row, col]));

/**
 * Chefe do esgoto, seguindo o actions.py do projeto:
 * gira em círculo e inverte a cada 2 voltas; < 90% notas musicais; < 60% anéis de notas;
 * < 70% laser da caixa de som; lacaios: avião de paraquedistas e ratos-bomba.
 */
export class MrKabumstic extends Actor {
  readonly hitRadius = 2.6;
  state: BossState = 'idle';
  private readonly sheet: SpriteSheet;
  readonly laser: SpeakerLaser;
  private angle = 0; private spin = 1; private turns = 0;
  private anim = 0; private attackPose = 0; private deathTime = 0;
  private musicTimer = 2; private ringCooldown = 0; private ringPulses = 0; private ringTimer = 0;
  private laserCooldown = 4; private planeTimer = 3; private bombTimer = 6;

  constructor(game: Game) {
    const sheet = new SpriteSheet(game.assets.texture('boss'), 19, 9);
    const center = game.world.sewer.arena.center;
    super(game, center.x, center.z, BOSS.HP, [sheet], 1, 0.03);
    this.body.sprite.scale.set(9.1, 10.4, 1);
    this.sheet = sheet;
    this.laser = new SpeakerLaser(game, () => SpeakerLaser.speakerPosition(this.pos, game.camera.yaw));
  }

  /** Centro da arena da masmorra atual (muda a cada esgoto gerado). */
  private get center(): THREE.Vector3 { return this.game.world.sewer.arena.center; }

  get fighting(): boolean { return this.state === 'fight'; }
  get canBeHit(): boolean { return this.fighting; }
  private get healthRatio(): number { return this.hp / BOSS.HP; }

  takeHit(): void {
    this.hp--; this.hurtTimer = 0.12;
    this.game.sfx.hit();
    if (this.hp <= 0) this.die();
  }

  begin(): void {
    this.state = 'fight';
    this.game.hud.showBanner('Mr. Kabumstic');
    this.game.onBossFightStart();
  }

  reset(): void {
    this.laser.stop();
    Object.assign(this, { hp: BOSS.HP, state: 'idle', musicTimer: 2, ringCooldown: 0, ringPulses: 0, laserCooldown: 4, planeTimer: 3, bombTimer: 6, attackPose: 0 });
    this.pos.copy(this.center);
    this.body.visible = true;
  }

  private die(): void {
    this.laser.stop();
    this.state = 'dead'; this.deathTime = 0;
    this.game.sfx.bossDie();
    this.game.hud.showBanner('Mr. Kabumstic derrotado!');
    this.game.clearMinions();
  }

  update(dt: number): void {
    if (this.state === 'idle' && !this.game.player.dead && this.game.isPlayerInArena()) this.begin();
    if (this.state === 'dead') { this.updateDeath(dt); return; }
    this.hurtTimer -= dt; this.anim += dt * 10; this.attackPose -= dt;
    let row: number = ANIM.IDLE, frames = 13;
    if (this.fighting) {
      row = this.circle(dt);
      frames = 6;
      this.attacks(dt);
      this.summon(dt);
      this.contactDamage();
    }
    if (this.attackPose > 0) { row = ANIM.ATTACK; frames = 9; }
    if (this.laser.phase === 'charge') this.sheet.setProgress(ANIM.SPEAKER_OUT, this.laser.chargeProgress, 9);
    else if (this.laser.phase === 'fire') this.sheet.setFrame(ANIM.SPEAKER_PLAY, Math.floor(this.anim) % 9);
    else this.sheet.setFrame(row, Math.floor(this.anim) % frames);
    this.syncSprite();
  }

  /** Movimento circular (move_bombastic); parado enquanto usa o laser. Devolve a linha de andar. */
  private circle(dt: number): number {
    if (this.laser.active) return ANIM.IDLE;
    const prev = this.angle;
    this.angle += 1.1 * this.spin * dt;
    if (Math.floor(prev / (Math.PI * 2)) !== Math.floor(this.angle / (Math.PI * 2)) && ++this.turns >= 2) { this.spin *= -1; this.turns = 0; }
    const target = new THREE.Vector3(this.center.x + Math.cos(this.angle) * BOSS.RADIUS, 0, this.center.z + Math.sin(this.angle) * BOSS.RADIUS);
    const step = target.sub(this.pos); step.y = 0;
    this.vel.copy(step.lengthSq() > 0.01 ? step.normalize().multiplyScalar(BOSS.SPEED) : step.set(0, 0, 0));
    this.pos.addScaledVector(this.vel, dt);
    const yaw = this.game.camera.yaw, screenX = this.vel.x * Math.cos(yaw) - this.vel.z * Math.sin(yaw);
    return screenX >= 0 ? ANIM.RIGHT : ANIM.LEFT;
  }

  private aimAtPlayer(): THREE.Vector3 {
    const d = this.game.player.pos.clone().sub(this.pos); d.y = 0;
    return d.normalize();
  }

  private attacks(dt: number): void {
    const hp = this.healthRatio;
    if (hp < 0.9 && (this.musicTimer -= dt) <= 0) { // musicAttack
      this.musicTimer = 2;
      this.game.spawn(new MusicNote(this.game, this.pos, this.aimAtPlayer()));
    }
    if (hp < 0.6 && this.ringPulses === 0 && (this.ringCooldown -= dt) <= 0) { this.ringPulses = 3; this.ringTimer = 0; this.ringCooldown = 12; }
    if (this.ringPulses > 0 && (this.ringTimer -= dt) <= 0) { // expanding_ring_attack
      this.ringTimer = 1; this.ringPulses--; this.attackPose = 0.8;
      const offset = Math.random() * Math.PI;
      for (let k = 0; k < 12; k++) {
        const a = offset + (k / 12) * Math.PI * 2;
        this.game.spawn(new MusicNote(this.game, this.pos, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 7, 0.4));
      }
    }
    if (hp < 0.7 && !this.laser.active && (this.laserCooldown -= dt) <= 0) { this.laser.start(); this.anim = 0; }
    if (this.laser.active && this.laser.update(dt, hp < 0.3)) this.laserCooldown = hp < 0.3 ? 6 : 10;
  }

  private summon(dt: number): void {
    const room = this.game.minionCount() < BOSS.MAX_MINIONS;
    if ((this.planeTimer -= dt) <= 0) { this.planeTimer = 10; if (room) this.game.spawn(new RatPlane(this.game)); }
    if ((this.bombTimer -= dt) <= 0) {
      this.bombTimer = 7;
      const a = this.game.world.sewer.arena;
      if (room) for (const x of [a.minX + 2, a.maxX - 2]) this.game.spawn(new BombRat(this.game, x, a.maxZ - 3));
    }
  }

  private contactDamage(): void {
    const player = this.game.player;
    if (!player.dead && flatDistance(player.pos, this.pos) < 2.2 && player.pos.y < 3) {
      const push = player.pos.clone().sub(this.pos); push.y = 0;
      player.hurt(BOSS.CONTACT_DAMAGE, push.normalize());
    }
  }

  private updateDeath(dt: number): void {
    this.deathTime += dt;
    const frame = DEATH_FRAMES[Math.floor(this.deathTime * 14)];
    if (frame) this.sheet.setFrame(frame[0], frame[1]); else this.body.visible = false;
    this.syncSprite();
  }
}
