import * as THREE from 'three';
import type { Hittable } from '../entities/Entity';
import type { Game } from '../Game';

/** Trava de mira (T ou botão direito): escolhe o inimigo mais à frente, vira a câmera para ele e desenha a retícula. */
export class LockOn {
  private static readonly RANGE = 22;
  private static readonly BREAK_RANGE = 30;
  private readonly reticle = document.createElement('div');
  private readonly scratch = new THREE.Vector3();
  target: Hittable | null = null;

  constructor(private readonly game: Game) {
    this.reticle.className = 'reticle';
    this.reticle.hidden = true;
    this.reticle.innerHTML = '<i></i><i></i><i></i><i></i>';
    document.body.append(this.reticle);
  }

  /** Trava no melhor alvo, ou solta se já estava travado. */
  toggle(): void {
    this.target = this.target ? null : this.pick();
    if (this.target) this.game.sfx.pickup();
  }

  release(): void { this.target = null; }

  /** Altura do centro do alvo (o chefe é maior). */
  aimPoint(t: Hittable): THREE.Vector3 { return this.scratch.copy(t.pos).setY(t.pos.y + Math.max(0.9, t.hitRadius * 0.8)); }

  update(dt: number): void {
    const t = this.target, player = this.game.player;
    if (t && (!t.canBeHit || player.dead || t.pos.distanceTo(player.pos) > LockOn.BREAK_RANGE || !this.game.world.sameZone(t.pos, player.pos))) this.target = null;
    if (!this.target) { this.reticle.hidden = true; return; }

    const dx = this.target.pos.x - player.pos.x, dz = this.target.pos.z - player.pos.z;
    if (Math.hypot(dx, dz) > 0.5) this.game.camera.face(Math.atan2(-dx, -dz), dt);

    const p = this.aimPoint(this.target).project(this.game.engine.camera);
    this.reticle.hidden = p.z > 1;
    this.reticle.style.transform = `translate(${((p.x + 1) / 2) * innerWidth}px, ${((1 - p.y) / 2) * innerHeight}px)`;
  }

  /** Inimigo mais bem colocado: perto e à frente da câmera. */
  private pick(): Hittable | null {
    const { player, world } = this.game;
    const yaw = this.game.camera.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let best: Hittable | null = null, bestScore = Infinity;
    for (const t of this.game.hittables()) {
      if (!t.canBeHit || !world.sameZone(t.pos, player.pos)) continue;
      const dx = t.pos.x - player.pos.x, dz = t.pos.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d > LockOn.RANGE) continue;
      const facing = d > 0 ? (dx * fx + dz * fz) / d : 1; // 1 = bem à frente
      const score = d * (2 - facing);
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }
}
