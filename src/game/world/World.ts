import * as THREE from 'three';
import type { Assets } from '../../engine/Assets';
import type { CameraWorld } from '../../engine/ThirdPersonCamera';
import { clamp } from '../../engine/math';
import { OVERWORLD, SEWER } from '../config';
import { ManholeCover } from './ManholeCover';
import { Overworld } from './Overworld';
import { Sewer } from './Sewer';

export type Zone = 'overworld' | 'sewer';

const ATMOSPHERE: Record<Zone, { sky: number; fog: number; near: number; far: number }> = {
  overworld: { sky: 0x8fd3ff, fog: 0xbfe6ff, near: 45, far: 150 },
  sewer: { sky: 0x0d1410, fog: 0x0d1410, near: 8, far: 45 },
};

/** Junta as áreas: altura do chão, limites, clima e as tampas que ligam uma à outra. */
export class World implements CameraWorld {
  readonly sewer: Sewer;
  readonly manholes: ManholeCover[];
  private readonly fog = new THREE.Fog(0xbfe6ff, 45, 150);
  private readonly sky = new THREE.Color(0x8fd3ff);

  constructor(private readonly scene: THREE.Scene, assets: Assets, anisotropy: number) {
    scene.background = this.sky;
    scene.fog = this.fog;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5a8a3a, 0.9 * Math.PI));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6 * Math.PI);
    sun.position.set(30, 60, 20);
    scene.add(sun);

    const surfaceLid = new THREE.Vector3(5, 0, 8);
    const sewerLid = new THREE.Vector3(SEWER.SX + SEWER.CH + 3, 0, -SEWER.SL + 3);
    new Overworld(scene, assets, anisotropy, [surfaceLid]);
    this.sewer = new Sewer(scene, assets, anisotropy);
    const grate = assets.pixel('grate');
    this.manholes = [
      new ManholeCover(scene, grate, surfaceLid, new THREE.Vector3(sewerLid.x, 0, sewerLid.z), this.groundAt),
      new ManholeCover(scene, grate, sewerLid, new THREE.Vector3(5, 0, 10), this.groundAt),
    ];
  }

  zoneOf(p: THREE.Vector3): Zone { return Sewer.contains(p.x) ? 'sewer' : 'overworld'; }
  sameZone(a: THREE.Vector3, b: THREE.Vector3): boolean { return this.zoneOf(a) === this.zoneOf(b); }

  readonly groundAt = (x: number, z: number): number => (Sewer.contains(x) ? Sewer.height(x, z) : Overworld.height(x, z));

  /** Chão sob alguém; pontes só seguram quem já está na altura delas. */
  groundUnder(p: THREE.Vector3): number {
    return Sewer.contains(p.x) ? Sewer.height(p.x, p.z, p.y >= -0.05) : Overworld.height(p.x, p.z);
  }

  clampToZone(p: THREE.Vector3): void {
    if (Sewer.contains(p.x)) { Sewer.clamp(p); return; }
    p.x = clamp(p.x, -OVERWORLD.HALF, OVERWORLD.HALF);
    p.z = clamp(p.z, -OVERWORLD.HALF, OVERWORLD.HALF);
  }

  isWading(p: THREE.Vector3): boolean { return Sewer.contains(p.x) && p.y < SEWER.WATER_Y + 0.05; }

  constrainCamera(cameraPos: THREE.Vector3, lookAt: THREE.Vector3): void {
    if (Sewer.contains(lookAt.x)) Sewer.clampCamera(cameraPos);
  }

  manholeNear(p: THREE.Vector3): ManholeCover | undefined { return this.manholes.find((m) => m.isNear(p)); }

  applyAtmosphere(zone: Zone): void {
    const a = ATMOSPHERE[zone];
    this.sky.set(a.sky); this.fog.color.set(a.fog); this.fog.near = a.near; this.fog.far = a.far;
    this.scene.background = this.sky;
  }

  update(dt: number): void { this.sewer.update(dt); }
}
