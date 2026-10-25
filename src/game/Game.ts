import type * as THREE from 'three';
import type { Assets } from '../engine/Assets';
import type { AudioEngine } from '../engine/AudioEngine';
import type { Engine } from '../engine/Engine';
import type { Input } from '../engine/Input';
import { ThirdPersonCamera } from '../engine/ThirdPersonCamera';
import { rnd } from '../engine/math';
import { BossMusic } from './audio/BossMusic';
import { Sfx } from './audio/Sfx';
import { MusicNote } from './boss/MusicNote';
import { MrKabumstic } from './boss/MrKabumstic';
import { Paratrooper } from './boss/Paratrooper';
import { RatPlane } from './boss/RatPlane';
import { BOSS, PLAYER, SEWER } from './config';
import { BombRat } from './entities/BombRat';
import type { Entity, Hittable } from './entities/Entity';
import { Explosion } from './entities/Explosion';
import { Pickup } from './entities/Pickup';
import { Player } from './entities/Player';
import { Rat } from './entities/Rat';
import type { ItemId } from './items/items';
import { RatSpawner } from './RatSpawner';
import type { Hud } from './ui/Hud';
import { Overworld } from './world/Overworld';
import { Sewer } from './world/Sewer';
import { World } from './world/World';

/** Junta mundo, jogador, entidades, chefe, interface e som; é o único que conhece todos. */
export class Game {
  readonly scene: THREE.Scene;
  readonly world: World;
  readonly camera: ThirdPersonCamera;
  readonly sfx: Sfx;
  readonly player: Player;
  readonly boss: MrKabumstic;
  readonly spawner = new RatSpawner(this);
  private readonly music: BossMusic;
  private entities: Entity[] = [];

  constructor(readonly engine: Engine, readonly assets: Assets, readonly input: Input, private readonly audio: AudioEngine, readonly hud: Hud) {
    this.scene = engine.scene;
    this.world = new World(this.scene, assets, engine.maxAnisotropy);
    this.camera = new ThirdPersonCamera(engine.camera, this.world);
    this.sfx = new Sfx(audio);
    this.music = new BossMusic(audio);
    this.player = new Player(this);
    this.boss = new MrKabumstic(this);
    this.camera.snapTo(this.player.pos.clone().setY(1.8));
    this.spawner.populate();
    this.placeItems();
    this.bindInput();
  }

  // ---------- serviços usados pelas entidades ----------
  spawn<T extends Entity>(entity: T): T { this.entities.push(entity); return entity; }

  explode(at: THREE.Vector3): void { this.spawn(new Explosion(this, at.clone())); }

  dropItem(item: ItemId, x: number, z: number): void { this.spawn(new Pickup(this, item, x, z)); }

  hittables(): Hittable[] {
    const targets: Hittable[] = this.entities.filter((e): e is Rat | BombRat => e instanceof Rat || e instanceof BombRat);
    targets.push(this.boss);
    return targets;
  }

  isPlayerInArena(): boolean { return Sewer.inArena(this.player.pos); }

  minionCount(): number {
    return this.entities.filter((e) => ((e instanceof Rat || e instanceof BombRat) && e.minion && e.alive) || e instanceof Paratrooper).length;
  }

  /** Ratos comuns do esgoto morrem quando a luta começa. */
  onBossFightStart(): void {
    for (const e of this.entities) if (e instanceof Rat && !e.minion && Sewer.contains(e.pos.x)) { e.kill(); }
  }

  clearMinions(): void {
    for (const e of this.entities) {
      const minion = (e instanceof Rat || e instanceof BombRat) && e.minion;
      if (minion || e instanceof Paratrooper || e instanceof RatPlane || e instanceof MusicNote) e.alive = false;
    }
  }

  onPlayerRespawn(): void {
    this.world.applyAtmosphere('overworld');
    this.camera.snapTo(this.player.pos.clone().setY(this.player.pos.y + 1.8));
    if (this.boss.fighting) { this.clearMinions(); this.boss.reset(); this.spawner.populateSewer(); }
  }

  // ---------- laço ----------
  update(dt: number): void {
    this.player.update(dt);
    for (const e of this.entities) if (e.alive) e.update(dt);
    this.boss.update(dt);
    this.removeDead();
    this.world.update(dt);

    const p = this.player.pos, ground = this.world.groundAt(p.x, p.z);
    this.camera.update(dt, p.clone().setY(ground + (p.y - ground) * 0.5 + 1.8)); // só metade do pulo, para não sacudir

    this.music.set(this.boss.fighting && !this.player.dead);
    this.music.update();
    if (Sewer.contains(p.x) && Math.random() < dt * 0.6) this.sfx.drip();

    this.hud.render({
      hp: this.player.hp, maxHp: PLAYER.MAX_HP, stamina: this.player.stamina, maxStamina: PLAYER.MAX_STAMINA,
      potions: this.player.inventory.count('potion'), hasHat: this.player.inventory.has('sombrero'),
      boss: { visible: this.boss.fighting, hp: this.boss.hp, maxHp: BOSS.HP },
      showManholePrompt: !this.player.dead && this.world.manholeNear(p) !== undefined,
    });
  }

  private removeDead(): void {
    const dead = this.entities.filter((e) => !e.alive);
    if (!dead.length) return;
    for (const e of dead) e.dispose();
    this.entities = this.entities.filter((e) => e.alive);
  }

  private useManhole(): void {
    const cover = this.world.manholeNear(this.player.pos);
    if (!cover || this.player.dead) return;
    this.sfx.manhole();
    this.player.teleport(cover.to);
    this.camera.snapTo(this.player.pos.clone().setY(this.player.pos.y + 1.8));
    this.world.applyAtmosphere(this.world.zoneOf(this.player.pos));
  }

  private bindInput(): void {
    const { input, player } = this;
    input.onLook((dx, dy) => this.camera.rotate(dx, dy));
    input.onZoom((d) => this.camera.zoom(d));
    input.onLockedClick(() => player.attack());
    input.onLockChange((locked) => this.hud.setHintVisible(!locked));
    input.onKey(['Space'], () => player.jump());
    input.onKey(['KeyF', 'KeyJ'], () => player.attack());
    input.onKey(['KeyQ', 'Digit1'], () => player.drinkPotion());
    input.onKey(['ShiftLeft', 'ShiftRight'], () => player.dash());
    input.onKey(['KeyE'], () => this.useManhole());
    const toggleMute = (): void => this.hud.setMuted(this.audio.toggleMute());
    input.onKey(['KeyM'], toggleMute);
    this.hud.onMuteClick(toggleMute);
  }

  /** Poções pelo mapa, no esgoto e na arena; o chapéu no ponto mais alto perto do início. */
  private placeItems(): void {
    const { SX, SW, SL, AL, CH } = SEWER;
    for (let i = 0; i < 8; i++) { const a = Math.random() * Math.PI * 2, r = rnd(12, 70); this.dropItem('potion', Math.cos(a) * r, Math.sin(a) * r); }
    for (const z of [-25, -5, 15, 30]) this.dropItem('potion', SX + (z % 2 ? -1 : 1) * rnd(CH + 2, SW - 2), z);
    this.dropItem('potion', SX - SW + 3, SL + AL - 3);
    this.dropItem('potion', SX + SW - 3, SL + AL - 3);
    let best = { x: -14, z: -14, h: -Infinity };
    for (let k = 0; k < 200; k++) {
      const x = rnd(-30, 30), z = rnd(-30, 30), h = Overworld.height(x, z);
      if (Math.hypot(x, z) >= 12 && h > best.h) best = { x, z, h };
    }
    this.dropItem('sombrero', best.x, best.z);
  }
}
