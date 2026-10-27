import * as THREE from 'three';
import { SpriteSheet } from '../../engine/SpriteSheet';
import { rnd } from '../../engine/math';
import { CUCARACHA } from '../config';
import type { Game } from '../Game';
import { Actor } from './Actor';

type State = 'wander' | 'circle' | 'lunge';

/**
 * Cucaracha: anda em bando. Quando vê alguém, o bando faz uma roda em volta e dança girando,
 * a roda vai fechando e, de vez em quando, uma sai da roda para dar o bote e volta para o lugar.
 */
export class Cucaracha extends Actor {
  readonly hitRadius = 1.1;
  readonly netKind = 'roach';
  private state: State = 'wander';
  private anim = Math.random() * 4;
  private hop = rnd(0, CUCARACHA.HOP_EVERY);
  private dying = 0;
  private engaged = 0;
  private lungeTime = 0;
  private lungeHit = false;
  private lungeCooldown = rnd(...CUCARACHA.LUNGE_COOLDOWN);
  private wanderTimer = 0;
  private readonly wanderDir = new THREE.Vector2();
  private readonly sheet: SpriteSheet;

  /** `slot`/`of`: lugar na roda do bando (espaçados igualmente). */
  constructor(game: Game, x: number, z: number, private readonly slot = 0, private readonly of = 1) {
    // folha do bombastic-pygame: 8 quadros de dança (48x32), linha 0 de frente e 1 de costas
    const sheet = new SpriteSheet(game.assets.texture('barata'), 8, 2);
    super(game, x, z, CUCARACHA.HP, [sheet], 2.7, 0.06, 1.8);
    this.sheet = sheet;
  }

  /** Está na roda (a música toca enquanto alguma estiver). */
  get dancing(): boolean { return this.state !== 'wander' && this.dying <= 0; }
  get canBeHit(): boolean { return super.canBeHit && this.dying <= 0; }

  takeHit(direction: THREE.Vector3, damage = 1): void {
    if (this.forwardHit(direction)) return;
    this.hp -= damage; this.hurtTimer = 0.15;
    this.vy = 6; this.knockback.copy(direction).setY(0);
    if (this.state === 'wander') this.state = 'circle';
    this.game.sfx.hit();
    if (this.hp <= 0) { this.dying = 0.4; this.game.dropCoins('cucaracha', this.pos.x, this.pos.z); }
  }

  update(dt: number): void {
    this.hurtTimer -= dt; this.lungeCooldown -= dt; this.wanderTimer -= dt; this.hop -= dt;
    if (this.dying > 0) {
      this.dying -= dt; this.body.sprite.scale.y *= 0.88;
      if (this.dying <= 0) this.alive = false;
      return;
    }
    const target = this.game.nearestTarget(this.pos);
    const to = new THREE.Vector3(target.pos.x - this.pos.x, 0, target.pos.z - this.pos.z);
    const dist = to.length();
    const canSee = !target.dead && this.game.world.sameZone(this.pos, target.pos);

    if (!canSee || (this.state !== 'wander' && dist > CUCARACHA.LOSE)) { this.state = 'wander'; this.engaged = 0; }
    else if (this.state === 'wander' && dist < CUCARACHA.SIGHT) this.state = 'circle';

    this.focus(this.state !== 'wander', dt);
    if (this.reacting && this.state === 'circle') this.vel.set(0, 0, 0);
    else if (this.state === 'lunge') {
      this.lungeTime += dt;
      this.vel.copy(to).normalize().multiplyScalar(CUCARACHA.LUNGE_SPEED);
      if (!this.lungeHit && dist < 1.1 && Math.abs(target.pos.y - this.pos.y) < 1.5) {
        this.lungeHit = true; target.hurt(CUCARACHA.DAMAGE, to.clone().normalize());
      }
      if (this.lungeHit || this.lungeTime > CUCARACHA.LUNGE_TIME) { this.state = 'circle'; this.lungeCooldown = rnd(...CUCARACHA.LUNGE_COOLDOWN); }
    } else if (this.state === 'circle') {
      this.engaged += dt;
      // lugar na roda: todas giram juntas (relógio comum) e a roda fecha com o tempo
      const radius = Math.max(CUCARACHA.ORBIT_MIN, CUCARACHA.ORBIT_START - this.engaged * CUCARACHA.ORBIT_SHRINK);
      const angle = (performance.now() / 1000) * CUCARACHA.SPIN + (this.slot / this.of) * Math.PI * 2;
      const spot = new THREE.Vector3(target.pos.x + Math.cos(angle) * radius, 0, target.pos.z + Math.sin(angle) * radius);
      const toSpot = spot.sub(this.pos).setY(0);
      const d = toSpot.length();
      this.vel.copy(toSpot).normalize().multiplyScalar(Math.min(CUCARACHA.SPEED, d * 4));
      if (this.lungeCooldown <= 0 && d < 1.5 && this.onGround) { this.state = 'lunge'; this.lungeTime = 0; this.lungeHit = false; this.game.sfx.squeak(); }
      if (this.hop <= 0 && this.onGround) { this.vy = CUCARACHA.HOP; this.hop = CUCARACHA.HOP_EVERY; } // pulinho no ritmo
    } else {
      if (this.wanderTimer <= 0) {
        this.wanderTimer = rnd(1.5, 3.5);
        const a = Math.random() * Math.PI * 2;
        this.wanderDir.set(Math.cos(a), Math.sin(a)).multiplyScalar(Math.random() < 0.6 ? 1.8 : 0);
      }
      this.vel.set(this.wanderDir.x, 0, this.wanderDir.y);
    }
    if (this.knockback.lengthSq() > 4) this.vel.set(0, 0, 0);
    this.integrate(dt);

    const row = this.facing();
    this.anim += dt * (this.state === 'lunge' ? 16 : this.state === 'circle' ? 11 : this.vel.lengthSq() > 0.1 ? 6 : 3);
    this.poseS = this.state === 'lunge' ? 1 : 0; this.poseC = Math.floor(this.anim) % 8;
    this.applyPose(this.poseS, this.poseC, row);
    this.syncSprite();
  }

  /** De costas (0) usa a linha de trás; os lados usam a da frente, espelhada para a esquerda. */
  protected applyPose(_s: number, c: number, facing: number): void { this.sheet.setFrame(facing === 0 ? 1 : 0, c, facing === 1); }

  get minionFlag(): boolean { return false; }
}
