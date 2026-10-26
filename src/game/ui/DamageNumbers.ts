import * as THREE from 'three';
import { rnd } from '../../engine/math';

export type NumberTone = 'enemy' | 'player' | 'heal';

interface Floater { el: HTMLElement; pos: THREE.Vector3; vy: number; vx: number; age: number }

/** Partículas numéricas: o número sobe com um pulinho, desacelera e some, preso a um ponto do mundo. */
export class DamageNumbers {
  private static readonly LIFE = 0.9;
  private static readonly MAX = 40;
  private readonly layer = document.createElement('div');
  private readonly live: Floater[] = [];
  private readonly scratch = new THREE.Vector3();

  constructor(private readonly camera: THREE.Camera) {
    this.layer.className = 'fx-layer';
    document.body.append(this.layer);
  }

  spawn(at: THREE.Vector3, amount: number, tone: NumberTone): void {
    if (this.live.length >= DamageNumbers.MAX) this.live.shift()?.el.remove();
    const el = document.createElement('span');
    el.className = `dmg ${tone}`;
    el.textContent = tone === 'heal' ? `+${amount}` : `-${amount}`;
    this.layer.append(el);
    this.live.push({ el, pos: at.clone(), vy: rnd(2.6, 3.4), vx: rnd(-0.8, 0.8), age: 0 });
  }

  update(dt: number): void {
    const w = innerWidth, h = innerHeight;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i]!;
      f.age += dt;
      if (f.age >= DamageNumbers.LIFE) { f.el.remove(); this.live.splice(i, 1); continue; }
      f.vy -= 7 * dt;
      f.pos.y += f.vy * dt;
      f.pos.x += f.vx * dt;
      const p = this.scratch.copy(f.pos).project(this.camera);
      if (p.z > 1) { f.el.style.opacity = '0'; continue; } // atrás da câmera
      const t = f.age / DamageNumbers.LIFE;
      f.el.style.opacity = String(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
      f.el.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) translate(-50%, -50%)`;
    }
  }
}
