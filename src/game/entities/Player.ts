import * as THREE from 'three';
import { Billboard } from '../../engine/Billboard';
import { SpriteSheet } from '../../engine/SpriteSheet';
import { facingRow } from '../../engine/math';
import { AIM_ASSIST, BOW, COMBO, MARACA, PHYSICS, PLAYER } from '../config';
import type { Game } from '../Game';
import { Inventory } from '../items/Inventory';
import { ITEMS, type ItemId, type Weapon } from '../items/items';
import { Arrow } from './Arrow';
import { Entity, type Hittable } from './Entity';
import { MaracaShot } from './MaracaShot';
import type { PlayerState, PoseSheet } from '../../net/protocol';
import { SlashProjectile } from './SlashProjectile';

/** Ordem das linhas do pygame (direita, esquerda, baixo, cima) para as do jogo (costas, esquerda, frente, direita). */
const PYGAME_DIR = [3, 1, 2, 0] as const;

export type { Weapon } from '../items/items';

/** Índice da mão: 0 = tecla 1, 1 = tecla 2. */
export type Hand = 0 | 1;

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
  /** Tempo que ainda dá para emendar o próximo golpe depois que o atual acabou. */
  private comboWindow = 0;
  /** Apertou ataque no fim do golpe: o próximo sai assim que este acabar. */
  private queued = false;
  /** As duas armas equipadas (tecla 1 e 2); a ativa vai na mão, a outra nas costas. */
  readonly hands: [Weapon | null, Weapon | null] = ['sword', null];
  activeHand: Hand = 0;
  private attackDuration: number = PLAYER.ATTACK_TIME;
  private readonly dashHit = new Set<Hittable>();
  private dashTimer = 0;
  private dashCooldown = 0;
  private walkAnim = 0;

  private readonly move: Layered;
  private readonly attackSheets: Layered;
  private readonly maracaSheets: Layered;
  private readonly bowSheets: Layered;
  /** Arma reserva desenhada nas costas. */
  private readonly back: Billboard;
  private readonly backIcons: Record<Weapon, THREE.Texture>;
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
    this.bowSheets = layered('player_bow', 'hat_bow', 8);          // corpo + arco (pygame, linhas 40-43)
    this.maracaSheets = { body: new SpriteSheet(Player.maracaAttackTexture(a), 18, 4), hat: new SpriteSheet(a.texture('hat_atk'), 18, 4) };
    this.body = new Billboard(game.scene, this.move.body.texture, PLAYER.SPRITE_SIZE, PLAYER.SPRITE_SIZE, 0.04);
    this.hat = new Billboard(game.scene, this.move.hat.texture, PLAYER.SPRITE_SIZE, PLAYER.SPRITE_SIZE, 0.04);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    game.scene.add(this.shadow);
    this.backIcons = { sword: a.texture('sword'), maraca: a.texture('maraca'), bow: a.texture('bow') };
    for (const t of Object.values(this.backIcons)) t.magFilter = t.minFilter = THREE.NearestFilter;
    this.back = new Billboard(game.scene, this.backIcons.sword, 1.25, 1.25, 0.5);
    this.inventory.add('sword');
    this.inventory.add('potion');
  }

  get dead(): boolean { return this.deadTimer > 0; }
  get dashing(): boolean { return this.dashTimer > 0; }
  get attacking(): boolean { return this.attackTimer > 0; }
  /** Arma na mão agora (a ativa; se a mão estiver vazia, a outra). */
  get weapon(): Weapon { return this.hands[this.activeHand] ?? this.hands[this.activeHand === 0 ? 1 : 0] ?? 'sword'; }
  private get row(): number { return facingRow(this.dir.x, this.dir.y, this.game.camera.yaw); }

  // ---------- ações ----------
  jump(): void {
    if (this.dead || !this.grounded) return;
    this.vy = PLAYER.JUMP; this.grounded = false;
    this.game.sfx.jump();
  }

  /** Etapa do combo em andamento (0 a 2), ou -1 fora de combo; a HUD mostra. */
  get comboStage(): number { return this.attacking || this.comboWindow > 0 ? this.combo : -1; }

  attack(): void {
    if (this.dead || this.dashing) return;
    if (this.attacking) {
      if (this.weapon === 'bow') return; // arco não emenda: uma flecha por puxada
      // no fim do golpe o clique fica guardado e emenda o próximo; antes disso é ignorado (sem spam)
      if (this.attackProgress >= COMBO.BUFFER && this.combo < 2) this.queued = true;
      return;
    }
    this.startAttack(this.comboWindow > 0 ? (this.combo + 1) % 3 : 0);
  }

  private startAttack(stage: number): void {
    this.combo = stage; this.queued = false; this.comboWindow = 0;
    if (this.weapon === 'bow') stage = this.combo = 0;
    this.attackDuration = this.weapon === 'maraca' ? MARACA.TIME : this.weapon === 'bow' ? BOW.TIME : PLAYER.ATTACK_TIME;
    if (stage === 2) this.attackDuration += COMBO.FINISHER_RECOVERY; // golpe final pesa mais
    this.attackTimer = this.attackDuration; this.attackFired = false;
    let wanted = this.dir.clone();
    if (this.weapon !== 'sword') {
      // de longe mira para onde a câmera olha
      const yaw = this.game.camera.yaw;
      wanted = new THREE.Vector2(-Math.sin(yaw), -Math.cos(yaw));
      if (this.weapon === 'maraca') this.game.sfx.maraca(); else this.game.sfx.bowDraw();
    } else this.game.sfx.slash();
    const range = this.weapon === 'maraca' ? AIM_ASSIST.MARACA_RANGE : this.weapon === 'bow' ? AIM_ASSIST.BOW_RANGE : AIM_ASSIST.SWORD_RANGE;
    this.dir.copy(this.game.lockOn.assist(this.pos, wanted, range));
  }

  /** Passa para a arma da mão `hand` (teclas 1 e 2); a outra vai para as costas. */
  selectHand(hand: Hand): void {
    if (hand === this.activeHand || !this.hands[hand] || this.attacking || this.dead) return;
    this.activeHand = hand; this.comboWindow = 0;
    this.game.sfx.pickup();
  }

  /** G: alterna entre as duas mãos. */
  switchWeapon(): void { this.selectHand(this.activeHand === 0 ? 1 : 0); }

  /** Põe uma arma que o jogador tem numa das mãos; se ela já estava na outra, as duas trocam de lugar. */
  equip(weapon: Weapon, hand: Hand): void {
    if (this.attacking) return;
    const other: Hand = hand === 0 ? 1 : 0;
    if (this.hands[other] === weapon) this.hands[other] = this.hands[hand];
    this.hands[hand] = weapon;
    if (!this.hands[this.activeHand]) this.activeHand = hand;
    this.game.sfx.pickup();
  }

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
      if (def.weapon) {
        // arma nova vai para uma mão vazia, se houver
        const free = this.hands.indexOf(null);
        if (free >= 0) { this.hands[free] = def.weapon; this.game.hud.showBanner(`${def.name}! Aperte ${free + 1} para empunhar`); }
        else this.game.hud.showBanner(`${def.name}! Equipe pelo inventário (Tab)`);
      } else this.game.hud.showBanner(`${def.name}! Shift para dar dash`);
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
    this.hurtTimer -= dt; this.dashTimer -= dt; this.dashCooldown -= dt; this.comboWindow -= dt;
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

    if (this.attacking) this.updateAttack(dt);
    if (this.dashing) this.dashThrough();
    this.render(moving);
  }

  private updateAttack(dt: number): void {
    this.attackTimer -= dt;
    const stage = this.combo, progress = this.attackProgress;
    // avanço no começo do golpe da espada (o final avança mais)
    if (this.weapon === 'bow') {
      if (!this.attackFired && progress >= BOW.FIRE_AT) {
        this.attackFired = true;
        this.game.spawn(new Arrow(this.game, this.pos, new THREE.Vector3(this.dir.x, 0, this.dir.y).normalize()));
        this.game.sfx.bowShot();
      }
      if (this.attackTimer <= 0) { this.attackTimer = 0; this.comboWindow = 0; }
      return;
    }
    if (this.weapon === 'sword' && progress < 0.5) {
      const lunge = COMBO.LUNGE[stage]! * (1 - progress * 2) * dt;
      this.pos.x += this.dir.x * lunge; this.pos.z += this.dir.y * lunge;
    }
    if (!this.attackFired && progress >= 1 / 6) {
      this.attackFired = true;
      const dir = new THREE.Vector3(this.dir.x, 0, this.dir.y).normalize();
      const damage = COMBO.DAMAGE[stage]!, power = COMBO.KNOCKBACK[stage]!;
      if (this.weapon === 'maraca') this.game.spawn(new MaracaShot(this.game, this.pos, dir, this.row, stage, damage, power));
      else this.game.spawn(new SlashProjectile(this.game, this.pos, dir, this.row, damage, power, COMBO.SLASH_SIZE[stage]));
      if (stage === 2) this.game.sfx.hit();
    }
    if (this.attackTimer > 0) return;
    this.attackTimer = 0;
    if (this.queued) this.startAttack(stage + 1);
    else this.comboWindow = stage < 2 ? COMBO.WINDOW : 0;
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

  /** Arma reserva nas costas: atrás do corpo, ou na frente quando ele está de costas para a câmera. */
  private renderBack(row: number, tint: number): void {
    const reserve = this.hands[this.activeHand === 0 ? 1 : 0];
    this.back.visible = !!reserve && reserve !== this.weapon && !this.dashing;
    if (!reserve) return;
    this.back.setMap(this.backIcons[reserve]);
    this.back.tint(tint);
    const toCamera = this.game.engine.camera.position.clone().sub(this.pos).setY(0).normalize();
    this.back.position.copy(this.pos).setY(this.pos.y + 1.15).addScaledVector(toCamera, row === 0 ? 0.25 : -0.25);
    this.back.material.rotation = row === 1 ? -0.5 : row === 3 ? 0.5 : 0.35; // inclinada como numa bainha
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
    return sheet === 'dash' ? this.dashSheets : sheet === 'attack' ? this.attackSheets : sheet === 'maraca' ? this.maracaSheets : sheet === 'bow' ? this.bowSheets : this.move;
  }

  // ---------- desenho ----------
  private render(moving: boolean): void {
    const row = this.row;
    const frames = (progress: number, n: number): number => Math.min(n - 1, Math.floor(progress * n));
    if (this.dashing) {
      this.pose.sheet = 'dash'; this.pose.col = frames(1 - this.dashTimer / PLAYER.DASH_TIME, 8);
    } else if (this.attacking) {
      if (this.weapon === 'bow') { this.pose.sheet = 'bow'; this.pose.col = frames(this.attackProgress, 8); }
      else { this.pose.sheet = this.weapon === 'maraca' ? 'maraca' : 'attack'; this.pose.col = this.combo * 6 + frames(this.attackProgress, 6); }
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

    this.renderBack(row, tint);

    const ground = this.game.world.groundAt(this.pos.x, this.pos.z), air = this.pos.y - ground;
    this.shadow.position.set(this.pos.x, ground + 0.05, this.pos.z);
    this.shadow.scale.setScalar(Math.max(0.4, 1 - air * 0.12));
    this.shadow.material.opacity = Math.max(0.1, 0.3 - air * 0.03);
  }
}
