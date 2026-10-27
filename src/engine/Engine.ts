import * as THREE from 'three';
import { CelOutline } from './CelOutline';

export interface System { update(dt: number): void }

/** Tempos do último quadro, em ms (para a depuração). */
export interface FrameTiming { update: number; render: number }

/** Renderer, cena, câmera e laço principal. Não sabe nada do jogo. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
  private readonly clock = new THREE.Clock();
  private readonly systems: System[] = [];
  private static readonly MAX_DT = 0.05;
  private readonly outline: CelOutline;
  readonly timing: FrameTiming = { update: 0, render: 0 };

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.info.autoReset = false; // o contorno faz várias passadas: conta o quadro inteiro
    this.outline = new CelOutline(this.renderer, this.camera);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  get maxAnisotropy(): number { return this.renderer.capabilities.getMaxAnisotropy(); }

  add(system: System): void { this.systems.push(system); }

  start(): void {
    const frame = (): void => {
      const dt = Math.min(this.clock.getDelta(), Engine.MAX_DT);
      const t0 = performance.now();
      for (const s of this.systems) s.update(dt); // leem as contagens do quadro anterior
      const t1 = performance.now();
      this.renderer.info.reset();
      this.outline.render(this.scene);
      this.timing.update = t1 - t0; this.timing.render = performance.now() - t1;
      requestAnimationFrame(frame);
    };
    frame();
  }

  private resize(): void {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.outline.setSize(innerWidth, innerHeight);
  }
}
