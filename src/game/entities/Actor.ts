import * as THREE from 'three';
import { Billboard } from '../../engine/Billboard';
import type { SpriteSheet } from '../../engine/SpriteSheet';
import { damp, facingRow } from '../../engine/math';
import type { MobKind, MobState } from '../../net/protocol';
import { PHYSICS } from '../config';
import type { Game } from '../Game';
import { Entity, type Hittable } from './Entity';

/** Criatura com corpo: posição, velocidade, gravidade, vida, sprite com direção e piscar de dano. */
/** Duração (s) da paradinha de reação ao notar o jogador. */
const ACTOR_REACT_TIME = 0.4;

export abstract class Actor extends Entity implements Hittable {
  readonly pos: THREE.Vector3;
  readonly vel = new THREE.Vector3();
  vy = 0;
  /** Empurrão de golpe, somado à velocidade e amortecido sozinho. */
  readonly knockback = new THREE.Vector3();
  readonly look = new THREE.Vector2(0, 1);
  hurtTimer = 0;
  /** Já notou um jogador (está perseguindo/atacando). */
  private focused = false;
  /** Paradinha de reação logo depois de notar o jogador. */
  private reactTimer = 0;
  /** Altura do sprite: o "!" aparece logo acima. */
  private readonly height: number;
  abstract readonly hitRadius: number;
  protected readonly body: Billboard;
  protected readonly sheets: SpriteSheet[];

  // ---------- online ----------
  /** Tipo no protocolo; null = não é sincronizado (ex.: chefe). */
  readonly netKind: MobKind | null = null;
  /** Id na rede (dono + contador); null até ser enviado pela primeira vez. */
  netId: string | null = null;
  /** Fantoche: outro cliente simula; aqui só segue o estado recebido. */
  puppet = false;
  /** Pose atual (folha/coluna própria de cada tipo), enviada aos outros. */
  protected poseS = 0;
  protected poseC = 0;
  private readonly netPos = new THREE.Vector3();
  private netHurt = false;
  private placed = false;

  constructor(game: Game, x: number, z: number, public hp: number, sheets: SpriteSheet[], size: number, anchorY: number, height = size) {
    super(game);
    this.height = height;
    this.pos = new THREE.Vector3(x, game.world.groundAt(x, z), z);
    this.sheets = sheets;
    const first = sheets[0];
    if (!first) throw new Error('Actor sem folha de sprites');
    this.body = new Billboard(game.scene, first.texture, size, height, anchorY);
  }

  get position(): THREE.Vector3 { return this.pos; }

  get canBeHit(): boolean { return this.alive && this.hp > 0; }
  abstract takeHit(direction: THREE.Vector3, damage?: number): void;

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

  get minionFlag(): boolean { return false; }

  /** Ainda está na paradinha de reação (não anda nem ataca). */
  protected get reacting(): boolean { return this.reactTimer > 0; }

  /**
   * Foco: chamado todo frame com "estou atrás de alguém?". Ao ganhar o foco aparece um "!" na cabeça,
   * o mob dá um pulinho de susto e espera um instante antes de agir. Lacaios do chefe já nascem focados.
   */
  protected focus(on: boolean, dt: number): void {
    this.reactTimer -= dt;
    if (on && !this.focused && !this.minionFlag) {
      this.game.emotes.alert(this.pos, this.height + 0.3);
      this.game.sfx.alert();
      this.reactTimer = ACTOR_REACT_TIME;
      if (this.onGround) this.vy = 4;
    }
    this.focused = on;
  }

  toNet(): MobState {
    const r = (v: number): number => Math.round(v * 100) / 100;
    return {
      id: this.netId!, k: this.netKind!, p: [r(this.pos.x), r(this.pos.y), r(this.pos.z)], d: [r(this.look.x), r(this.look.y)],
      hp: this.hp, s: this.poseS, c: this.poseC, h: this.hurtTimer > 0, m: this.minionFlag,
    };
  }

  /** Recebe o estado do dono; a primeira vez já aparece no lugar, depois desliza até lá. */
  fromNet(m: MobState): void {
    this.netPos.set(...m.p);
    if (!this.placed) { this.pos.copy(this.netPos); this.placed = true; }
    this.look.set(m.d[0], m.d[1]);
    this.hp = m.hp; this.poseS = m.s; this.poseC = m.c; this.netHurt = m.h;
  }

  updatePuppet(dt: number): void {
    this.pos.lerp(this.netPos, damp(12, dt));
    this.hurtTimer = this.netHurt ? 0.1 : this.hurtTimer - dt;
    this.applyPose(this.poseS, this.poseC, facingRow(this.look.x, this.look.y, this.game.camera.yaw));
    this.syncSprite();
  }

  /** Desenha a pose (s, c) virada para `facing` (0 costas, 1 esquerda, 2 frente, 3 direita). */
  protected applyPose(_s: number, _c: number, _facing: number): void { /* cada tipo de mob */ }

  /** Golpe num fantoche vai para quem o simula; devolve true se foi o caso. */
  protected forwardHit(direction: THREE.Vector3): boolean {
    if (!this.puppet) return false;
    this.game.mobSync?.hit(this, direction);
    this.hurtTimer = 0.15;
    this.game.sfx.hit();
    return true;
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
