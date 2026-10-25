import * as THREE from 'three';
import { toonMaterial } from '../../engine/toon';
import { flatDistance } from '../../engine/math';

/** Tampa do esgoto: leva o jogador de `at` para `to` (tecla E). */
export class ManholeCover {
  private static readonly REACH = 1.4;

  constructor(scene: THREE.Scene, map: THREE.Texture, readonly at: THREE.Vector3, readonly to: THREE.Vector3,
    groundAt: (x: number, z: number) => number) {
    at.y = groundAt(at.x, at.z) + 0.04;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6),
      toonMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2 }));
    // inclina junto com o terreno
    const n = new THREE.Vector3(groundAt(at.x - 0.5, at.z) - groundAt(at.x + 0.5, at.z), 1,
      groundAt(at.x, at.z - 0.5) - groundAt(at.x, at.z + 0.5)).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    mesh.position.copy(at);
    scene.add(mesh);
  }

  isNear(p: THREE.Vector3): boolean { return flatDistance(p, this.at) < ManholeCover.REACH; }
}
