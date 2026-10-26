import * as THREE from 'three';
import { Billboard } from '../../engine/Billboard';
import { flatDistance } from '../../engine/math';
import { isWalkable } from '../../engine/procedural/TileGrid';
import { BOW } from '../config';
import type { Game } from '../Game';
import { Entity } from './Entity';

const lerp = ([a, b]: readonly [number, number], t: number): number => a + (b - a) * t;

/** Flecha do arco: voa reto e rápido, para no primeiro inimigo ou na parede. */
export class Arrow extends Entity {
  private life = BOW.LIFE;
  private readonly pos: THREE.Vector3;
  private readonly sprite: Billboard;
  private readonly scratch = new THREE.Vector3();

  /** `charge` 0..1: força da puxada (dano, velocidade e empurrão). */
  constructor(game: Game, from: THREE.Vector3, private readonly dir: THREE.Vector3, private readonly charge = 1) {
    super(game);
    this.pos = from.clone().addScaledVector(dir, 0.9); // `from` já é a altura do peito
    const tex = game.assets.texture('arrow');
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    this.sprite = new Billboard(game.scene, tex, BOW.SIZE, BOW.SIZE, 0.5);
  }

  update(dt: number): void {
    this.life -= dt;
    this.pos.addScaledVector(this.dir, lerp(BOW.SPEED, this.charge) * dt);
    this.sprite.position.copy(this.pos);
    this.aim();
    for (const target of this.game.hittables()) {
      if (!target.canBeHit) continue;
      if (flatDistance(target.pos, this.pos) < target.hitRadius && Math.abs(target.pos.y + 1 - this.pos.y) < 1.8) {
        target.takeHit(this.dir.clone().multiplyScalar(lerp(BOW.KNOCKBACK, this.charge)), Math.round(lerp(BOW.DAMAGE, this.charge)));
        this.alive = false;
        return;
      }
    }
    const blocked = this.game.world.groundAt(this.pos.x, this.pos.z) > this.pos.y || this.hitsWall();
    if (this.life <= 0 || blocked) this.alive = false;
  }

  /** A imagem aponta para cima-direita (45°): gira para seguir a direção do voo na tela. */
  private aim(): void {
    const cam = this.game.engine.camera;
    const a = this.scratch.copy(this.pos).project(cam);
    const b = this.pos.clone().add(this.dir).project(cam);
    const aspect = innerWidth / innerHeight;
    this.sprite.material.rotation = Math.atan2(b.y - a.y, (b.x - a.x) * aspect) - Math.PI / 4;
  }

  /** No esgoto, parede é rocha: a flecha some ao bater. */
  private hitsWall(): boolean {
    const { world } = this.game;
    if (world.zoneOf(this.pos) !== 'sewer') return false;
    return !isWalkable(world.sewer.tileAt(this.pos.x, this.pos.z));
  }

  dispose(): void { this.sprite.dispose(); }
}
