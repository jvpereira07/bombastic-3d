import * as THREE from 'three';

interface Emote { el: HTMLElement; anchor: THREE.Vector3; height: number; age: number }

/** Partículas de texto sobre a cabeça (ex.: "!" quando um mob nota o jogador). Seguem o mob e sobem um pouco. */
export class Emotes {
  private static readonly LIFE = 0.9;
  private readonly layer = document.createElement('div');
  private readonly live: Emote[] = [];
  private readonly scratch = new THREE.Vector3();

  constructor(private readonly camera: THREE.Camera) {
    this.layer.className = 'fx-layer';
    document.body.append(this.layer);
  }

  /** `anchor` é a posição viva do mob (o balão acompanha); `height` é a altura da cabeça. */
  alert(anchor: THREE.Vector3, height: number, text = '!'): void {
    const el = document.createElement('span');
    el.className = 'emote';
    el.textContent = text;
    this.layer.append(el);
    this.live.push({ el, anchor, height, age: 0 });
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i]!;
      e.age += dt;
      if (e.age >= Emotes.LIFE) { e.el.remove(); this.live.splice(i, 1); continue; }
      const rise = Math.min(1, e.age / 0.3) * 0.4; // sobe um pouquinho ao aparecer
      const p = this.scratch.copy(e.anchor).setY(e.anchor.y + e.height + rise).project(this.camera);
      e.el.hidden = p.z > 1;
      const t = e.age / Emotes.LIFE;
      e.el.style.opacity = String(t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2);
      e.el.style.left = `${((p.x + 1) / 2) * innerWidth}px`;
      e.el.style.top = `${((1 - p.y) / 2) * innerHeight}px`;
    }
  }
}
