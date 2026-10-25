import * as THREE from 'three';
import { Billboard } from '../../engine/Billboard';
import { SpriteSheet } from '../../engine/SpriteSheet';
import { facingRow } from '../../engine/math';
import { MARACA, PHYSICS, PLAYER } from '../config';
import type { Game } from '../Game';
import { Inventory } from '../items/Inventory';
import { ITEMS, type ItemId } from '../items/items';
import { Entity, type Hittable } from './Entity';
import { MaracaShot } from './MaracaShot';
import type { PlayerState, PoseSheet } from '../../net/protocol';
import { SlashProjectile } from './SlashProjectile';

/** Ordem das linhas do pygame (direita, esquerda, baixo, cima) para as do jogo (costas, esquerda, frente, direita). */
const PYGAME_DIR = [3, 1, 2, 0] as const;

export type Weapon = 'sword' | 'maraca';

/** Folhas do corpo e a camada de chapéu correspondente (mesma grade, desenhada por cima). */
interface Layered { body: SpriteSheet; hat: SpriteSheet }

export class Player extends Entity {
  readonly pos = new THREE.Vector3();
  /** Direção em que olha/anda, no plano XZ (x, z). */
  readonly dir = new THREE.Vector2(0, 1);
  readonly inventory = new Inventory();
  hp: number = PLAYER.MAX_HP;
  stamina: number = PLAYER.MAX_STAMINA;
  vy = 0;

  private grounded = true;
  private knockback: THREE.Vector3 | null = null;
  private hurtTimer = 0;
  private deadTimer = 0;
  private attackTimer = 0;
  private attackFired = false;
  private combo = 0;
  /** Arma na mão; o ataque (clique/F) usa ela. G troca quando já tem a maraca. */
  weapon: Weapon = 'sword';
  private attackDuration: number = PLAYER.ATTACK_TIME;
  private readonly dashHit = new Set<Hittable>();
  private dashTimer = 0;
  private dashCooldown = 0;
  private walkAnim = 0;

  private readonly move: Layered;
  private readonly attackSheets: Layered;
  private readonly maracaSheets: Layered;
  private readonly dashSheets: Layered;
  private readonly body: Billboard;
  private readonly hat: Billboard;
  private readonly shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

  constructor(game: Game) {
    super(game);
    const a = game.assets;
    const layered = (body: string, hat: string, cols: number): Layered =>
      ({ body: new SpriteSheet(a.texture(body), cols, 4), hat: new SpriteSheet(a.texture(hat), cols, 4) });
    this.move = layered('player_move', 'hat_move', 7);          // col 0 parado, 1-6 andando
    this.attackSheets = layered('player_atk', 'hat_atk', 18);   // combo de 3 golpes x 6 quadros
    this.dashSheets = layered('player_dash', 'hat_dash', 8);
    this.maracaSheets = { body: new SpriteSheet(Player.maracaAttackTexture(a), 18, 4), hat: new SpriteSheet(a.texture('hat_atk'), 18, 4) };
    this.body = new Billboard(game.scene, this.move.body.texture, PLAYER.SPRITE_SIZE, PLAYER.SPRITE_SIZE, 0.04);
    this.hat = new Billboard(game.scene, this.move.hat.texture, PLAYER.SPRITE_SIZE, PLAYER.SPRITE_SIZE, 0.04);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    game.scene.add(this.shadow);
    this.inventory.add('potion');
  }

  get dead(): boolean { return this.deadTimer > 0; }
  get dashing(): boolean { return this.dashTimer > 0; }
  get attacking(): boolean { return this.attackTimer > 0; }
  private get row(): number { return facingRow(this.dir.x, this.dir.y, this.game.camera.yaw); }

  // ---------- ações ----------
  jump(): void {
    if (this.dead || !this.grounded) return;
    this.vy = PLAYER.JUMP; this.grounded = false;
    this.game.sfx.jump();
  }

  attack(): void {
    if (this.attacking || this.dead || this.dashing) return;
    this.attackDuration = this.weapon === 'maraca' ? MARACA.TIME : PLAYER.ATTACK_TIME;
    this.attackTimer = this.attackDuration; this.attackFired = false;
    this.combo = (this.combo + 1) % 3;
    if (this.weapon === 'maraca') {
      // de longe mira para onde a câmera olha
      const yaw = this.game.camera.yaw;
      this.dir.set(-Math.sin(yaw), -Math.cos(yaw));
      this.game.sfx.maraca();
    } else this.game.sfx.slash();
  }

  /** Troca entre espada e maraca (a maraca vai na segunda mão; precisa tê-la). */
  switchWeapon(): void {
    if (!this.inventory.hasAbility('maraca') || this.attacking || this.dead) return;
    this.weapon = this.weapon === 'sword' ? 'maraca' : 'sword';
    this.game.sfx.pickup();
  }

  /** Empunha uma arma específica (pelo inventário). */
  wield(weapon: Weapon): void { if (weapon !== this.weapon) this.switchWeapon(); }

  dash(): void {
    if (!this.inventory.hasAbility('dash') || this.dead || this.dashing || this.dashCooldown > 0 || this.stamina < PLAYER.DASH_COST) return;
    this.stamina -= PLAYER.DASH_COST;
    this.dashTimer = PLAYER.DASH_TIME; this.dashCooldown = PLAYER.DASH_COOLDOWN; this.attackTimer = 0;
    this.dashHit.clear();
    this.game.sfx.dash();
  }

  drinkPotion(): void {
    if (!this.dead && this.inventory.use('potion', this)) this.game.sfx.potion();
  }

  heal(amount: number): boolean {
    if (this.hp >= PLAYER.MAX_HP) return false;
    this.hp = Math.min(PLAYER.MAX_HP, this.hp + amount);
    return true;
  }

  /** Pega um item do chão; devolve false se não couber. */
  collect(item: ItemId): boolean {
    if (!this.inventory.add(item)) return false;
    const def = ITEMS[item];
    if (def.kind === 'equipment') {
      this.game.sfx.hat();
      this.game.hud.showBanner(def.grants.includes('maraca') ? `${def.name}! G troca entre espada e maraca (ataque de longe)` : `${def.name}! Shift para dar dash`);
    }
    else this.game.sfx.pickup();
    return true;
  }

  hurt(damage: number, direction: THREE.Vector3): void {
    if (this.hurtTimer > 0 || this.dashing || this.dead) return; // dash dá invencibilidade
    this.game.sfx.hurt();
    this.hp = Math.max(0, this.hp - damage);
    this.hurtTimer = PLAYER.HURT_TIME;
    this.vy = 5; this.grounded = false;
    this.knockback = new THREE.Vector3(direction.x, 0, direction.z).multiplyScalar(7);
    if (this.hp <= 0) this.deadTimer = PLAYER.RESPAWN_TIME;
  }

  teleport(to: THREE.Vector3): void {
    this.pos.set(to.x, this.game.world.groundAt(to.x, to.z), to.z);
    this.vy = 0; this.knockback = null;
  }

  // ---------- simulação ----------
  update(dt: number): void {
    this.hurtTimer -= dt; this.dashTimer -= dt; this.dashCooldown -= dt;
    this.stamina = Math.min(PLAYER.MAX_STAMINA, this.stamina + PLAYER.STAMINA_REGEN * dt);
    if (this.dead) { this.updateDeath(dt); this.render(false); return; }

    const moving = this.walk(dt);
    if (this.knockback) {
      this.pos.addScaledVector(this.knockback, dt);
      this.knockback.multiplyScalar(Math.exp(-dt * 6));
    }
    this.game.world.clampToZone(this.pos);
    this.fall(dt);
    this.walkAnim = moving && this.grounded ? this.walkAnim + dt * 12 : 0;

    if (this.attacking) {
      this.attackTimer -= dt;
      if (!this.attackFired && this.attackProgress >= 1 / 6) {
        this.attackFired = true;
        const dir = new THREE.Vector3(this.dir.x, 0, this.dir.y).normalize();
        if (this.weapon === 'maraca') this.game.spawn(new MaracaShot(this.game, this.pos, dir, this.row, this.combo));
        else this.game.spawn(new SlashProjectile(this.game, this.pos, dir, this.row));
      }
    }
    if (this.dashing) this.dashThrough();
    this.render(moving);
  }

  private get attackProgress(): number { return 1 - this.attackTimer / this.attackDuration; }

  /** O dash atropela: cada inimigo no caminho leva um golpe e é jogado para o lado. */
  private dashThrough(): void {
    const dir = new THREE.Vector3(this.dir.x, 0, this.dir.y).normalize();
    for (const target of this.game.hittables()) {
      if (this.dashHit.has(target) || !target.canBeHit) continue;
      const offset = target.pos.clone().sub(this.pos).setY(0);
      if (offset.length() > target.hitRadius + 0.4 || Math.abs(target.pos.y - this.pos.y) > 1.6) continue;
      this.dashHit.add(target);
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      if (side.dot(offset) < 0) side.negate();
      target.takeHit(dir.add(side).normalize().multiplyScalar(PLAYER.DASH_KNOCKBACK));
    }
  }

  /** Ataque com a maraca: corpo do pygame sem a espada + camada da maraca, na ordem de linhas do jogo. */
  static maracaAttackTexture(assets: Game['assets']): THREE.Texture {
    const body = assets.texture('player_raw').image as HTMLImageElement;
    const maraca = assets.texture('maraca_anim').image as HTMLImageElement;
    const T = 32, canvas = document.createElement('canvas');
    canvas.width = 18 * T; canvas.height = 4 * T;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Canvas 2D indisponível');
    PYGAME_DIR.forEach((d, row) => {
      for (let k = 0; k < 3; k++) for (let c = 0; c < 6; c++) {
        const x = (k * 6 + c) * T, y = row * T;
        g.drawImage(body, c * T, (16 + 4 * k + d) * T, T, T, x, y, T, T);
        g.drawImage(maraca, c * T, (4 * k + d) * T, T, T, x, y, T, T);
      }
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Movimento relativo à câmera; devolve se está andando. */
  private walk(dt: number): boolean {
    const yaw = this.game.camera.yaw, sin = Math.sin(yaw), cos = Math.cos(yaw);
    if (this.dashing) {
      this.pos.x += this.dir.x * PLAYER.SPEED * PLAYER.DASH_SPEED * dt;
      this.pos.z += this.dir.y * PLAYER.SPEED * PLAYER.DASH_SPEED * dt;
      return false;
    }
    if (this.attacking) return false;
    let { x, z } = this.game.input.axis();
    if (!x && !z) return false;
    const len = Math.hypot(x, z); x /= len; z /= len;
    const speed = PLAYER.SPEED * (this.game.world.isWading(this.pos) ? 0.5 : 1); // água poluída deixa lento
    this.dir.set(x * cos + z * sin, -x * sin + z * cos);
    this.pos.x += this.dir.x * speed * dt;
    this.pos.z += this.dir.y * speed * dt;
    return true;
  }

  private fall(dt: number): void {
    const ground = this.game.world.groundUnder(this.pos);
    this.vy -= PHYSICS.GRAVITY * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= ground) { this.pos.y = ground; this.vy = 0; this.grounded = true; }
  }

  private updateDeath(dt: number): void {
    this.deadTimer -= dt;
    if (this.deadTimer > 0) return;
    this.deadTimer = 0;
    this.hp = PLAYER.MAX_HP; this.stamina = PLAYER.MAX_STAMINA;
    this.teleport(new THREE.Vector3(0, 0, 0));
    this.game.onPlayerRespawn();
  }

  /** Quadro atual (folha + coluna), o que os outros jogadores precisam para desenhar este. */
  readonly pose: { sheet: PoseSheet; col: number } = { sheet: 'move', col: 0 };

  /** Estado enviado ao servidor no modo online. */
  netState(): PlayerState {
    const r = (v: number): number => Math.round(v * 100) / 100;
    return {
      p: [r(this.pos.x), r(this.pos.y), r(this.pos.z)], d: [r(this.dir.x), r(this.dir.y)],
      sheet: this.pose.sheet, col: this.pose.col, hat: this.inventory.hasLayer('hat'), dead: this.dead,
    };
  }

  private sheetsFor(sheet: PoseSheet): Layered {
    return sheet === 'dash' ? this.dashSheets : sheet === 'attack' ? this.attackSheets : sheet === 'maraca' ? this.maracaSheets : this.move;
  }

  // ---------- desenho ----------
  private render(moving: boolean): void {
    const row = this.row;
    const frames = (progress: number, n: number): number => Math.min(n - 1, Math.floor(progress * n));
    if (this.dashing) {
      this.pose.sheet = 'dash'; this.pose.col = frames(1 - this.dashTimer / PLAYER.DASH_TIME, 8);
    } else if (this.attacking) {
      this.pose.sheet = this.weapon === 'maraca' ? 'maraca' : 'attack'; this.pose.col = this.combo * 6 + frames(this.attackProgress, 6);
    } else {
      this.pose.sheet = 'move'; this.pose.col = !this.grounded ? 2 : moving ? 1 + (Math.floor(this.walkAnim) % 6) : 0;
    }
    const sheets = this.sheetsFor(this.pose.sheet);
    sheets.body.setFrame(row, this.pose.col);
    sheets.hat.texture.offset.copy(sheets.body.texture.offset);
    this.body.setMap(sheets.body.texture);
    this.hat.setMap(sheets.hat.texture);

    const flash = this.hurtTimer > 0 && Math.floor(this.hurtTimer * 20) % 2 === 0;
    const tint = this.dead ? 0x777777 : flash ? 0xff7070 : 0xffffff;
    this.body.tint(tint); this.hat.tint(tint);
    this.body.position.copy(this.pos);
    this.hat.visible = this.inventory.hasLayer('hat');
    // um fio à frente do corpo, para não brigar na profundidade
    this.hat.position.copy(this.pos).addScaledVector(this.game.engine.camera.position.clone().sub(this.pos).normalize(), 0.03);

    const ground = this.game.world.groundAt(this.pos.x, this.pos.z), air = this.pos.y - ground;
    this.shadow.position.set(this.pos.x, ground + 0.05, this.pos.z);
    this.shadow.scale.setScalar(Math.max(0.4, 1 - air * 0.12));
    this.shadow.material.opacity = Math.max(0.1, 0.3 - air * 0.03);
  }
}
