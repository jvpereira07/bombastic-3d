import * as THREE from 'three';
import type { Game } from '../Game';

/** Mira do arco: cruz no ponto para onde a flecha vai, com um anel que enche conforme a carga. */
export class BowReticle {
  private static readonly DISTANCE = 14;
  private readonly el = document.createElement('div');
  private readonly scratch = new THREE.Vector3();

  constructor(private readonly game: Game) {
    this.el.className = 'bow-aim';
    this.el.hidden = true;
    document.body.append(this.el);
  }

  update(): void {
    const { player } = this.game, charge = player.bowCharge;
    this.el.hidden = charge === null;
    if (charge === null) return;
    const target = this.game.lockOn.target;
    const at = target ? this.scratch.copy(target.pos).setY(target.pos.y + 1)
      : this.scratch.set(player.pos.x + player.dir.x * BowReticle.DISTANCE, player.pos.y + 1.1, player.pos.z + player.dir.y * BowReticle.DISTANCE);
    const p = at.project(this.game.engine.camera);
    this.el.style.transform = `translate(${((p.x + 1) / 2) * innerWidth}px, ${((1 - p.y) / 2) * innerHeight}px)`;
    this.el.style.setProperty('--charge', String(charge));
    this.el.classList.toggle('full', charge >= 1);
  }
}
