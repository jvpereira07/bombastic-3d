import * as THREE from 'three';
import { Billboard } from '../../engine/Billboard';
import type { SpriteSheet } from '../../engine/SpriteSheet';
import { facingRow } from '../../engine/math';
import { PHYSICS } from '../config';
import type { Game } from '../Game';
import { Entity, type Hittable } from './Entity';

/** Criatura com corpo: posição, velocidade, gravidade, vida, sprite com direção e piscar de dano. */
export abstract class Actor extends Entity implements Hittable {
  readonly pos: THREE.Vector3;
  readonly vel = new THREE.Vector3();
  vy = 0;
  /** Empurrão de golpe, somado à velocidade e amortecido sozinho. */
  readonly knockback = new THREE.Vector3();
  readonly look = new THREE.Vector2(0, 1);
  hurtTimer = 0;
  abstract readonly hitRadius: number;
  protected readonly body: Billboard;
  protected readonly sheets: SpriteSheet[];

  constructor(game: Game, x: number, z: number, public hp: number, sheets: SpriteSheet[], size: number, anchorY: number) {
    super(game);
    this.pos = new THREE.Vector3(x, game.world.groundAt(x, z), z);
    this.sheets = sheets;
    const first = sheets[0];
    if (!first) throw new Error('Actor sem folha de sprites');
    this.body = new Billboard(game.scene, first.texture, size, size, anchorY);
  }

  get canBeHit(): boolean { return this.alive && this.hp > 0; }
  abstract takeHit(direction: THREE.Vector3): void;

  get onGround(): boolean { return this.pos.y <= this.game.world.groundAt(this.pos.x, this.pos.z) + 0.01; }

  /** Anda pela velocidade, respeita os limites da área e cai com a gravidade. */
  protected integrate(dt: number): void {
    this.pos.x += (this.vel.x + this.knockback.x) * dt;
    this.pos.z += (this.vel.z + this.knockback.z) * dt;
    this.knockback.multiplyScalar(Math.exp(-dt * 6));
    this.game.world.clampToZone(this.pos);
    this.vy -= PHYSICS.GRAVITY * dt;
    this.pos.y += this.vy * dt;
    const ground = this.game.world.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y <= ground) { this.pos.y = ground; this.vy = 0; }
  }

  /** Linha da folha conforme para onde anda, vista pela câmera. */
  protected facing(): number {
    if (this.vel.lengthSq() > 0.05) this.look.set(this.vel.x, this.vel.z).normalize();
    return facingRow(this.look.x, this.look.y, this.game.camera.yaw);
  }

  protected syncSprite(): void {
    this.body.tint(this.hurtTimer > 0 ? 0xff5050 : 0xffffff);
    this.body.position.copy(this.pos);
  }

  dispose(): void {
    this.body.dispose();
    for (const s of this.sheets) s.dispose();
  }
}
