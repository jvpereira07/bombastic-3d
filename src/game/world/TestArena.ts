import * as THREE from 'three';
import { OVERWORLD } from '../config';

/** Mundo de testes: chão branco e plano com grade de 1 m (linhas de 10 m mais fortes). */
export class TestArena {
  static height(): number { return 0; }

  constructor(scene: THREE.Scene) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(OVERWORLD.SIZE, OVERWORLD.SIZE), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const fine = new THREE.GridHelper(OVERWORLD.SIZE, OVERWORLD.SIZE, 0xe2e2e2, 0xe2e2e2);
    const coarse = new THREE.GridHelper(OVERWORLD.SIZE, OVERWORLD.SIZE / 10, 0xbdbdbd, 0xbdbdbd);
    fine.position.y = 0.01; coarse.position.y = 0.02;
    scene.add(fine, coarse, new THREE.AxesHelper(3));
  }
}
