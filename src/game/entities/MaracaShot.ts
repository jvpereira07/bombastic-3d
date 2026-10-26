import * as THREE from 'three';
import { Billboard } from '../../engine/Billboard';
import { SpriteSheet } from '../../engine/SpriteSheet';
import { flatDistance } from '../../engine/math';
import { MARACA } from '../config';
import type { Game } from '../Game';
import { Entity } from './Entity';

/** Linha da folha do pygame (direita, esquerda, baixo, cima) para cada linha do jogo (costas, esquerda, frente, direita). */
const PYGAME_DIR = [3, 1, 2, 0] as const;

/** Tiro da maraca: onda sonora que voa longe e para no primeiro inimigo que acerta. */
export class MaracaShot extends Entity {
  private life = MARACA.LIFE;
  private anim = 0;
  private readonly pos: THREE.Vector3;
  private readonly sheet: SpriteSheet;
  private readonly sprite: Billboard;
  private readonly row: number;

  constructor(game: Game, from: THREE.Vector3, private readonly dir: THREE.Vector3, facing: number, combo: number, private readonly damage = 1, private readonly power = 1) {
    super(game);
    this.pos = from.clone().addScaledVector(dir, 0.8);
    this.row = combo * 4 + PYGAME_DIR[facing]!;
    this.sheet = new SpriteSheet(game.assets.texture('maraca_slash'), 6, 12);
    this.sprite = new Billboard(game.scene, this.sheet.texture, MARACA.SIZE, MARACA.SIZE, 0.5);
  }

  update(dt: number): void {
    this.life -= dt; this.anim += dt * 14;
    this.pos.addScaledVector(this.dir, MARACA.SPEED * dt);
    this.sheet.setFrame(this.row, Math.floor(this.anim) % 6);
    this.sprite.position.set(this.pos.x, this.pos.y + 1.1, this.pos.z);
    for (const target of this.game.hittables()) {
      if (!target.canBeHit) continue;
      if (flatDistance(target.pos, this.pos) < target.hitRadius && Math.abs(target.pos.y - this.pos.y) < 1.8) {
        target.takeHit(this.dir.clone().multiplyScalar(MARACA.KNOCKBACK * this.power), this.damage);
        this.alive = false;
        return;
      }
    }
    if (this.life <= 0 || this.pos.y < this.game.world.groundAt(this.pos.x, this.pos.z) - 1) this.alive = false;
  }

  dispose(): void { this.sprite.dispose(); this.sheet.dispose(); }
}
