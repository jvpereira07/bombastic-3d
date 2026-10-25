import * as THREE from 'three';
import { CelOutline } from './CelOutline';

export interface System { update(dt: number): void }

/** Renderer, cena, câmera e laço principal. Não sabe nada do jogo. */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
  private readonly clock = new THREE.Clock();
  private readonly systems: System[] = [];
  private static readonly MAX_DT = 0.05;
  private readonly outline: CelOutline;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.outline = new CelOutline(this.renderer, this.camera);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  get maxAnisotropy(): number { return this.renderer.capabilities.getMaxAnisotropy(); }

  add(system: System): void { this.systems.push(system); }

  start(): void {
    const frame = (): void => {
      const dt = Math.min(this.clock.getDelta(), Engine.MAX_DT);
      for (const s of this.systems) s.update(dt);
      this.outline.render(this.scene);
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
