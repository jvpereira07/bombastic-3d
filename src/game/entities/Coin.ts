import * as THREE from 'three';
import { Billboard } from '../../engine/Billboard';
import { flatDistance } from '../../engine/math';
import { COIN } from '../config';
import type { Game } from '../Game';
import { Entity } from './Entity';

/** Moeda no chão: salta ao cair, gira e é puxada para o jogador quando ele chega perto. */
export class Coin extends Entity {
  private readonly pos: THREE.Vector3;
  private readonly vel: THREE.Vector3;
  private readonly sprite: Billboard;
  private t = Math.random() * 6;

  constructor(game: Game, x: number, z: number) {
    super(game);
    this.pos = new THREE.Vector3(x, game.world.groundAt(x, z) + 0.5, z);
    const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 2;
    this.vel = new THREE.Vector3(Math.cos(a) * s, 6 + Math.random() * 2, Math.sin(a) * s); // espalha num pulinho
    this.sprite = new Billboard(game.scene, game.assets.pixel('moeda'), 0.7, 0.7);
  }

  get position(): THREE.Vector3 { return this.pos; }

  update(dt: number): void {
    this.t += dt;
    const player = this.game.player, ground = this.game.world.groundAt(this.pos.x, this.pos.z);
    const d = flatDistance(player.pos, this.pos);
    if (!player.dead && d < COIN.MAGNET && this.pos.y <= ground + 0.6) {
      const to = player.pos.clone().sub(this.pos).setY(0).normalize();
      this.pos.addScaledVector(to, COIN.SPEED * (1 - d / COIN.MAGNET + 0.3) * dt);
      this.pos.y = ground;
    } else {
      this.vel.y -= 20 * dt;
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y <= ground) { this.pos.y = ground; this.vel.set(0, 0, 0); }
    }
    this.sprite.position.set(this.pos.x, this.pos.y + 0.15 + Math.abs(Math.sin(this.t * 3)) * 0.15, this.pos.z);
    this.sprite.sprite.scale.x = 0.7 * Math.abs(Math.cos(this.t * 4)) + 0.08; // "gira" achatando
    if (!player.dead && d < COIN.PICK && Math.abs(player.pos.y - this.pos.y) < 2) {
      player.addCoins(1);
      this.alive = false;
    }
  }

  dispose(): void { this.sprite.dispose(); }
}
