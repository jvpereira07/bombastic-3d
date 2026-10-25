import * as THREE from 'three';
import { toonMaterial } from '../../engine/toon';
import { OVERWORLD } from '../config';

/** Mundo de testes: chão branco e plano com grade de 1 m (linhas de 10 m mais fortes). */
export class TestArena {
  /** Rio de testes (faixa azul ao longo de z) onde ficam os jacarés. */
  static readonly RIVER_X = 14;
  static readonly RIVER_HALF = 3;

  static height(): number { return 0; }

  constructor(scene: THREE.Scene) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(OVERWORLD.SIZE, OVERWORLD.SIZE), toonMaterial({ color: 0xffffff }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const fine = new THREE.GridHelper(OVERWORLD.SIZE, OVERWORLD.SIZE, 0xe2e2e2, 0xe2e2e2);
    const coarse = new THREE.GridHelper(OVERWORLD.SIZE, OVERWORLD.SIZE / 10, 0xbdbdbd, 0xbdbdbd);
    fine.position.y = 0.01; coarse.position.y = 0.02;
    const river = new THREE.Mesh(new THREE.PlaneGeometry(TestArena.RIVER_HALF * 2, OVERWORLD.SIZE), toonMaterial({ color: 0x6fb7e8 }));
    river.rotation.x = -Math.PI / 2;
    river.position.set(TestArena.RIVER_X, 0.03, 0);
    scene.add(fine, coarse, river, new THREE.AxesHelper(3));
  }
}
