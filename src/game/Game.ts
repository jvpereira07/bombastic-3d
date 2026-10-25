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
import { BOSS, PLAYER } from './config';
import { BombRat } from './entities/BombRat';
import type { Entity, Hittable } from './entities/Entity';
import { Explosion } from './entities/Explosion';
import { Gator } from './entities/Gator';
import { Pickup } from './entities/Pickup';
import { Player } from './entities/Player';
import { Rat } from './entities/Rat';
import type { ItemId } from './items/items';
import { RatSpawner } from './RatSpawner';
import { CreativeMenu } from './ui/CreativeMenu';
import type { Hud } from './ui/Hud';
import { Overworld } from './world/Overworld';
import { Sewer } from './world/Sewer';
import { TestArena } from './world/TestArena';
import { World, type WorldMode } from './world/World';

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

  constructor(readonly engine: Engine, readonly assets: Assets, readonly input: Input, private readonly audio: AudioEngine, readonly hud: Hud, mode: WorldMode = 'normal') {
    this.scene = engine.scene;
    this.world = new World(this.scene, assets, engine.maxAnisotropy, mode);
    this.camera = new ThirdPersonCamera(engine.camera, this.world);
    this.sfx = new Sfx(audio);
    this.music = new BossMusic(audio);
    this.player = new Player(this);
    this.boss = new MrKabumstic(this);
    this.camera.snapTo(this.player.pos.clone().setY(1.8));
    if (mode === 'test') this.setupTest();
    else { this.spawner.populate(); this.placeItems(); this.stockSewer(this.world.sewer.layout.seed); }
    this.bindInput();
  }

  // ---------- serviços usados pelas entidades ----------
  spawn<T extends Entity>(entity: T): T { this.entities.push(entity); return entity; }

  explode(at: THREE.Vector3): void { this.spawn(new Explosion(this, at.clone())); }

  dropItem(item: ItemId, x: number, z: number): void { this.spawn(new Pickup(this, item, x, z)); }

  hittables(): Hittable[] {
    const targets: Hittable[] = this.entities.filter((e): e is Rat | BombRat | Gator => e instanceof Rat || e instanceof BombRat || e instanceof Gator);
    targets.push(this.boss);
    return targets;
  }

  isPlayerInArena(): boolean { return this.world.sewer.inArena(this.player.pos); }

  minionCount(): number {
    return this.entities.filter((e) => ((e instanceof Rat || e instanceof BombRat) && e.minion && e.alive) || e instanceof Paratrooper).length;
  }

  /** Ratos comuns do esgoto morrem quando a luta começa. */
  onBossFightStart(): void {
    for (const e of this.entities) if (e instanceof Rat && !e.minion && Sewer.contains(e.pos.x)) { e.kill(); }
  }

  /** Remove todos os ratos e paraquedistas (mundo de testes). */
  clearEnemies(): void {
    for (const e of this.entities) if (e instanceof Rat || e instanceof BombRat || e instanceof Paratrooper || e instanceof Gator) e.alive = false;
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
    this.world.shards.update(this.player.pos);
    for (const e of this.entities) if (e.alive && this.world.shards.simulates(e.position)) e.update(dt);
    this.boss.update(dt);
    this.removeDead();
    this.world.update(dt, this.player.pos);

    const p = this.player.pos, ground = this.world.groundAt(p.x, p.z);
    this.camera.update(dt, p.clone().setY(ground + (p.y - ground) * 0.5 + 1.8)); // só metade do pulo, para não sacudir

    this.music.set(this.boss.fighting && !this.player.dead);
    this.music.update();
    if (Sewer.contains(p.x) && Math.random() < dt * 0.6) this.sfx.drip();

    this.hud.render({
      hp: this.player.hp, maxHp: PLAYER.MAX_HP, stamina: this.player.stamina, maxStamina: PLAYER.MAX_STAMINA,
      potions: this.player.inventory.count('potion'), hasHat: this.player.inventory.has('sombrero'), hasMaraca: this.player.inventory.has('maraca'), weapon: this.player.weapon,
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
    if (Sewer.contains(cover.to.x)) { this.enterSewer(); return; }
    this.arrive(cover.to);
  }

  private arrive(at: THREE.Vector3): void {
    this.player.teleport(at);
    this.camera.snapTo(this.player.pos.clone().setY(this.player.pos.y + 1.8));
    this.world.applyAtmosphere(this.world.zoneOf(this.player.pos));
  }

  /** Cada descida gera um esgoto novo: troca a masmorra, limpa quem estava lá e repovoa. */
  enterSewer(): void {
    const seed = Sewer.newSeed();
    this.world.regenerateSewer(seed);
    for (const e of this.entities) {
      const pos = e.position;
      if ((pos && Sewer.contains(pos.x)) || e instanceof RatPlane || e instanceof MusicNote || e instanceof Paratrooper) e.alive = false;
    }
    this.boss.reset();
    this.spawner.populateSewer();
    this.stockSewer(seed);
    this.arrive(this.world.sewer.entry);
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
    input.onKey(['KeyG'], () => player.switchWeapon());
    input.onKey(['KeyE'], () => this.useManhole());
    const toggleMute = (): void => this.hud.setMuted(this.audio.toggleMute());
    input.onKey(['KeyM'], toggleMute);
    this.hud.onMuteClick(toggleMute);
  }

  /** Mundo de testes: sem ratos, itens ao lado do início; R cria um rato perto do jogador, C abre o menu criativo. */
  private setupTest(): void {
    new CreativeMenu(this);
    this.hud.showBanner('Mundo de testes · C abre o menu criativo');
    for (let i = 0; i < 3; i++) this.dropItem('potion', -3 + i * 3, 4);
    this.dropItem('sombrero', 0, -4);
    this.dropItem('maraca', 3, -4);
    this.spawn(new Gator(this, TestArena.RIVER_X, 0));
    this.input.onKey(['KeyR'], () => {
      const a = Math.random() * Math.PI * 2, p = this.player.pos;
      this.spawn(new Rat(this, p.x + Math.cos(a) * 8, p.z + Math.sin(a) * 8));
    });
  }

  /** Jacarés nos canais e poções nas salas da masmorra atual. */
  private stockSewer(seed: number): void {
    for (const p of this.world.sewer.waterSpots(4, seed)) this.spawn(new Gator(this, p.x, p.z));
    for (let i = 0; i < 5; i++) { const p = this.world.sewer.randomFloor(); this.dropItem('potion', p.x, p.z); }
  }

  /** Poções pelo mapa; o chapéu no ponto mais alto perto do início. */
  private placeItems(): void {
    for (let i = 0; i < 8; i++) { const a = Math.random() * Math.PI * 2, r = rnd(12, 70); this.dropItem('potion', Math.cos(a) * r, Math.sin(a) * r); }
    let best = { x: -14, z: -14, h: -Infinity };
    for (let k = 0; k < 200; k++) {
      const x = rnd(-30, 30), z = rnd(-30, 30), h = Overworld.height(x, z);
      if (Math.hypot(x, z) >= 12 && h > best.h) best = { x, z, h };
    }
    this.dropItem('sombrero', best.x, best.z);
    this.dropItem('maraca', -6, 5);
  }
}
