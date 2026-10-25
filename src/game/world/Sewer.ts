import * as THREE from 'three';
import type { Assets } from '../../engine/Assets';
import { clamp } from '../../engine/math';
import { SEWER } from '../config';

const { SX, SW, SL, CH, WATER_Y, AL, WALL_H } = SEWER;

/** Túnel do esgoto com canal de água poluída, pontes e a arena do chefe no fim. */
export class Sewer {
  static readonly BRIDGES: readonly number[] = Array.from({ length: 5 }, (_, i) => -SL + 10 + i * 16);
  private readonly water: THREE.Texture;

  static contains(x: number): boolean { return x > SX / 2; }
  static inArena(p: THREE.Vector3): boolean { return Sewer.contains(p.x) && p.z > SL + 1; }
  static inWater(x: number, z: number): boolean { return Math.abs(x - SX) < CH && z < SL; }
  static onBridge(z: number): boolean { return Sewer.BRIDGES.some((bz) => Math.abs(z - bz) < 1.5); }

  static height(x: number, z: number, onTop = false): number {
    if (Sewer.inWater(x, z)) return onTop && Sewer.onBridge(z) ? 0 : WATER_Y;
    return 0;
  }

  static clamp(p: THREE.Vector3, margin = 0.6): void {
    p.x = clamp(p.x, SX - SW + margin, SX + SW - margin);
    p.z = clamp(p.z, -SL + margin, SL + AL - margin);
  }

  static clampCamera(p: THREE.Vector3): void {
    Sewer.clamp(p, 0.4);
    p.y = Math.min(WALL_H - 0.6, p.y);
  }

  static randomWalkway(): THREE.Vector3 {
    const side = Math.random() < 0.5 ? -1 : 1;
    return new THREE.Vector3(SX + side * (CH + 1 + Math.random() * (SW - CH - 2)), 0, -SL + 4 + Math.random() * (SL * 2 - 8));
  }

  constructor(scene: THREE.Scene, assets: Assets, anisotropy: number) {
    const tile = (name: string, rx: number, ry: number): THREE.Texture => assets.tile(name, rx, ry, anisotropy);
    const lambert = (map: THREE.Texture, side: THREE.Side = THREE.FrontSide): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({ map, side });
    const floorPlane = (w: number, h: number, mat: THREE.Material): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.x = -Math.PI / 2; return m;
    };

    for (const side of [-1, 1]) { // calçadas + mureta
      const w = SW - CH;
      const walk = floorPlane(w, SL * 2, lambert(tile('floor', w / 2, SL)));
      walk.position.set(SX + side * (CH + w / 2), 0, 0); scene.add(walk);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, SL * 2), lambert(tile('brick', 1, SL)));
      lip.position.set(SX + side * CH, -0.25, 0); scene.add(lip);
    }

    this.water = tile('water', CH, SL);
    const water = floorPlane(CH * 2, SL * 2, new THREE.MeshBasicMaterial({ map: this.water, color: 0xb8d8a0 }));
    water.position.set(SX, WATER_Y, 0); scene.add(water);

    const brick = (rx: number, ry: number): THREE.Material => lambert(tile('brick', rx, ry), THREE.BackSide);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(SW * 2, WALL_H, SL * 2 + AL),
      [brick(SL + AL / 2, 6), brick(SL + AL / 2, 6), brick(SW, SL + AL / 2), new THREE.MeshBasicMaterial({ visible: false }), brick(SW, 6), brick(SW, 6)]);
    walls.position.set(SX, WALL_H / 2 - 0.01, AL / 2); scene.add(walls);

    const arena = floorPlane(SW * 2, AL, lambert(tile('floor', SW, AL / 2)));
    arena.position.set(SX, 0, SL + AL / 2); scene.add(arena);
    const canalEnd = new THREE.Mesh(new THREE.BoxGeometry(CH * 2, 0.5, 0.3), lambert(tile('brick', CH, 1)));
    canalEnd.position.set(SX, -0.25, SL); scene.add(canalEnd);

    for (const z of Sewer.BRIDGES) {
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(CH * 2 + 0.4, 0.2, 3), lambert(tile('floor', CH, 1.5)));
      bridge.position.set(SX, -0.1, z); scene.add(bridge);
    }

    const tunnelLight = new THREE.PointLight(0x9fe08a, 0.8 * Math.PI, 70, 0); tunnelLight.position.set(SX, 6, 0);
    const arenaLight = new THREE.PointLight(0xffb060, 0.9 * Math.PI, 50, 0); arenaLight.position.set(SX, 9, SL + AL / 2);
    scene.add(tunnelLight, arenaLight);
  }

  update(dt: number): void { this.water.offset.y = (this.water.offset.y + dt * 0.15) % 1; }
}
