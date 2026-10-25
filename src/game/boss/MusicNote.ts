import * as THREE from 'three';
import { Billboard } from '../../engine/Billboard';
import { SpriteSheet } from '../../engine/SpriteSheet';
import { SEWER } from '../config';
import type { Game } from '../Game';
import { Entity } from '../entities/Entity';

/** Nota musical do chefe: segue reta com um vai-e-vem lateral (wave motion do musicAttack). */
export class MusicNote extends Entity {
  private static readonly DAMAGE = 8;
  private static readonly LIFE = 4;
  private age = 0;
  private readonly base: THREE.Vector3;
  private readonly side: THREE.Vector3;
  private readonly sheet: SpriteSheet;
  private readonly sprite: Billboard;

  constructor(game: Game, from: THREE.Vector3, private readonly dir: THREE.Vector3, private readonly speed = 9, private readonly wave = 1.2) {
    super(game);
    this.base = from.clone().setY(2.2);
    this.side = new THREE.Vector3(-dir.z, 0, dir.x);
    this.sheet = new SpriteSheet(game.assets.texture('note'), 4, 1);
    this.sheet.setFrame(0, (Math.random() * 4) | 0);
    this.sprite = new Billboard(game.scene, this.sheet.texture, 1, 1, 0.5);
    game.sfx.note();
  }

  update(dt: number): void {
    this.age += dt;
    this.base.addScaledVector(this.dir, this.speed * dt);
    const p = this.sprite.position.copy(this.base).addScaledVector(this.side, Math.sin(this.age * 10) * this.wave);
    const player = this.game.player;
    if (!player.dead && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 0.8 && Math.abs(p.y - (player.pos.y + 1.2)) < 1.4) {
      player.hurt(MusicNote.DAMAGE, this.dir);
      this.alive = false;
    }
    const { SX, SW, SL, AL } = SEWER;
    if (this.age >= MusicNote.LIFE || Math.abs(this.base.x - SX) > SW || this.base.z > SL + AL || this.base.z < SL - 6) this.alive = false;
  }

  dispose(): void { this.sprite.dispose(); this.sheet.dispose(); }
}
