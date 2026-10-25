import * as THREE from 'three';
import type { Assets } from '../../engine/Assets';
import { Billboard } from '../../engine/Billboard';
import { SpriteSheet } from '../../engine/SpriteSheet';
import { flatDistance } from '../../engine/math';
import { PLAYER } from '../config';
import type { Game } from '../Game';
import { Entity, type Hittable } from './Entity';

/** Corte da espada como projétil: nasce colado no jogador (acerta de perto), voa um pouco e empurra forte. */
export class SlashProjectile extends Entity {
  private static readonly SPEED = 14;
  private static readonly LIFE = 0.3;
  private static readonly FRAMES = 5;
  private static full?: THREE.Texture;
  private life = SlashProjectile.LIFE;
  private readonly pos: THREE.Vector3;
  private readonly hit = new Set<Hittable>();
  private readonly sheet: SpriteSheet;
  private readonly sprite: Billboard;

  /** Junta os quadros de cada direção num corte só, inteiro e parado (uma linha por direção). */
  private static fullTexture(assets: Assets): THREE.Texture {
    if (SlashProjectile.full) return SlashProjectile.full;
    const img = assets.texture('slash').image as HTMLImageElement;
    const w = img.width / SlashProjectile.FRAMES, h = img.height / 4;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível');
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < SlashProjectile.FRAMES; col++) ctx.drawImage(img, col * w, row * h, w, h, 0, row * h, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return (SlashProjectile.full = tex);
  }

  constructor(game: Game, from: THREE.Vector3, private readonly dir: THREE.Vector3, row: number) {
    super(game);
    this.pos = from.clone().addScaledVector(dir, 0.6);
    this.sheet = new SpriteSheet(SlashProjectile.fullTexture(game.assets).clone(), 1, 4);
    this.sheet.setFrame(row, 0);
    this.sprite = new Billboard(game.scene, this.sheet.texture, 2.4, 2.4, 0.5);
  }

  update(dt: number): void {
    this.life -= dt;
    this.pos.addScaledVector(this.dir, SlashProjectile.SPEED * dt);
    this.sprite.position.set(this.pos.x, this.pos.y + 1.1, this.pos.z);
    for (const target of this.game.hittables()) {
      if (this.hit.has(target) || !target.canBeHit) continue;
      if (flatDistance(target.pos, this.pos) < target.hitRadius && Math.abs(target.pos.y - this.pos.y) < 1.6) {
        this.hit.add(target);
        target.takeHit(this.dir.clone().multiplyScalar(PLAYER.SLASH_KNOCKBACK));
      }
    }
    if (this.life <= 0) this.alive = false;
  }

  dispose(): void { this.sprite.dispose(); this.sheet.dispose(); }
}
