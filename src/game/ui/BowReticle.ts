import * as THREE from 'three';
import type { Game } from '../Game';

/** Mira do arco: cruz no ponto para onde a flecha vai, com um anel que enche conforme a carga. */
export class BowReticle {
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
    // o ponto que a flecha vai acertar (sem trava, é o centro da tela)
    const p = this.scratch.copy(player.aimPoint()).project(this.game.engine.camera);
    this.el.style.transform = `translate(${((p.x + 1) / 2) * innerWidth}px, ${((1 - p.y) / 2) * innerHeight}px)`;
    this.el.style.setProperty('--charge', String(charge));
    this.el.classList.toggle('full', charge >= 1);
  }
}
