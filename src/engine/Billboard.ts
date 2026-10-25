import * as THREE from 'three';

/** Sprite que sempre encara a câmera, ancorado pelos pés (ou por `anchorY`). */
export class Billboard {
  readonly sprite: THREE.Sprite;
  readonly material: THREE.SpriteMaterial;

  constructor(private readonly scene: THREE.Scene, map: THREE.Texture, width: number, height: number, anchorY = 0) {
    this.material = new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.5 });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.scale.set(width, height, 1);
    this.sprite.center.set(0.5, anchorY);
    scene.add(this.sprite);
  }

  get position(): THREE.Vector3 { return this.sprite.position; }
  set visible(v: boolean) { this.sprite.visible = v; }
  get visible(): boolean { return this.sprite.visible; }

  setMap(map: THREE.Texture): void {
    if (this.material.map !== map) { this.material.map = map; this.material.needsUpdate = true; }
  }

  tint(color: THREE.ColorRepresentation): void { this.material.color.set(color); }

  dispose(): void {
    this.scene.remove(this.sprite);
    this.material.dispose();
  }
}
