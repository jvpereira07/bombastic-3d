import * as THREE from 'three';
import type { Assets } from '../../engine/Assets';
import { Billboard } from '../../engine/Billboard';
import { flatDistance } from '../../engine/math';
import { SpriteSheet } from '../../engine/SpriteSheet';
import { toonMaterial } from '../../engine/toon';
import { VENDOR } from '../config';

const WOOD = 0x9a6233, WOOD_DARK = 0x6e4320, CLOTH_A = 0xd8433a, CLOTH_B = 0xfff3d1;

/** Placa de madeira com texto desenhada em canvas. */
function signTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 72;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6e4320'; g.fillRect(0, 0, 256, 72);
  g.fillStyle = '#9a6233'; g.fillRect(6, 6, 244, 60);
  g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#2a1206'; g.fillText(text, 130, 40);
  g.fillStyle = '#fff3d1'; g.fillText(text, 128, 37);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Vendedor de poções: o "tutorial guy" do bombastic-pygame, parado (animação de 10 quadros) atrás de
 * uma barraquinha de madeira com toldo listrado, poções no balcão e uma placa. A frente da barraca
 * olha para `facing` (o centro do mapa). Quem chega a VENDOR.TALK do balcão pode falar com ele (E).
 */
export class Vendor {
  readonly pos: THREE.Vector3;
  /** Ponto em frente ao balcão, de onde se fala com ele. */
  readonly counter: THREE.Vector3;
  private readonly group = new THREE.Group();
  private readonly sheet: SpriteSheet;
  private readonly body: Billboard;
  private t = Math.random() * 2;

  constructor(scene: THREE.Scene, assets: Assets, x: number, z: number, facing: THREE.Vector3, groundAt: (x: number, z: number) => number) {
    const forward = facing.clone().sub(new THREE.Vector3(x, 0, z)).setY(0).normalize();
    const yaw = Math.atan2(forward.x, forward.z);
    // base no ponto mais baixo do terreno sob a barraca: as pernas descem até o chão em vez de flutuar
    const base = Math.min(...[[-1.8, -1], [1.8, -1], [-1.8, 1.4], [1.8, 1.4], [0, 0]].map(([dx, dz]) => {
      const p = new THREE.Vector3(dx, 0, dz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      return groundAt(x + p.x, z + p.z);
    }));
    this.group.position.set(x, base, z);
    this.group.rotation.y = yaw;
    this.buildStall(assets);
    scene.add(this.group);

    // vendedor atrás do balcão (z local negativo), olhando para a frente
    this.pos = new THREE.Vector3(0, 0, -0.9).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(x, base, z));
    this.counter = new THREE.Vector3(0, 0, 1.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(x, base, z));
    this.sheet = new SpriteSheet(assets.texture('vendedor'), VENDOR.FRAMES, 1);
    this.body = new Billboard(scene, this.sheet.texture, VENDOR.SPRITE_SIZE, VENDOR.SPRITE_SIZE, 0.02);
    this.body.position.copy(this.pos);
  }

  private buildStall(assets: Assets): void {
    const wood = toonMaterial({ color: WOOD }), dark = toonMaterial({ color: WOOD_DARK });
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      return mesh;
    };
    // balcão: tampo, frente e base
    box(3.4, 0.14, 1.0, wood, 0, 1.1, 0.5);
    box(3.2, 1.0, 0.12, dark, 0, 0.55, 0.95);
    box(3.2, 0.12, 0.9, dark, 0, 0.1, 0.5);
    // postes (do chão até o toldo)
    for (const [px, pz] of [[-1.6, 0.95], [1.6, 0.95], [-1.6, -1.2], [1.6, -1.2]] as const) {
      const h = pz > 0 ? 2.9 : 3.3; // os de trás são mais altos: toldo inclinado para a frente
      box(0.14, h, 0.14, dark, px, h / 2, pz);
    }
    // toldo listrado inclinado
    const awning = new THREE.Group();
    awning.position.set(0, 3.1, -0.1);
    awning.rotation.x = 0.2;
    const stripes = 8;
    for (let i = 0; i < stripes; i++) {
      const m = toonMaterial({ color: i % 2 ? CLOTH_B : CLOTH_A });
      const s = new THREE.Mesh(new THREE.BoxGeometry(3.8 / stripes, 0.06, 2.8), m);
      s.position.x = -1.9 + (i + 0.5) * (3.8 / stripes);
      awning.add(s);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(3.8 / stripes, 0.35, 0.04), m); // franja na frente
      flap.position.set(s.position.x, -0.2, 1.4);
      awning.add(flap);
    }
    this.group.add(awning);
    // poções no balcão
    const potion = assets.pixel('potion');
    for (const px of [-1.1, -0.45, 0.2, 0.9]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: potion, transparent: true, alphaTest: 0.5 }));
      s.scale.set(0.55, 0.55, 1); s.center.set(0.5, 0);
      s.position.set(px, 1.17, 0.55);
      this.group.add(s);
    }
    // placa sobre o toldo
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.53), new THREE.MeshBasicMaterial({ map: signTexture('Poções'), side: THREE.DoubleSide }));
    sign.position.set(0, 3.75, 1.05);
    this.group.add(sign);
  }

  /** Perto o bastante do balcão para falar. */
  canTalk(p: THREE.Vector3): boolean {
    return flatDistance(p, this.counter) < VENDOR.TALK && Math.abs(p.y - this.counter.y) < 2.5;
  }

  update(dt: number): void {
    this.t += dt;
    this.sheet.setFrame(0, Math.floor(this.t * VENDOR.FPS) % VENDOR.FRAMES);
  }
}
