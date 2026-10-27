import * as THREE from 'three';
import type { Assets } from '../../engine/Assets';
import type { CameraWorld } from '../../engine/ThirdPersonCamera';
import { clamp } from '../../engine/math';
import { OVERWORLD, SEWER, VENDOR } from '../config';
import { ManholeCover } from './ManholeCover';
import { Overworld } from './Overworld';
import { Sewer } from './Sewer';
import { TestArena } from './TestArena';
import { ShardManager } from './ShardManager';
import { SHARD, type ShardId } from './shards';

export type Zone = 'overworld' | 'sewer';
export type WorldMode = 'normal' | 'test';

type Atmosphere = { sky: number; fog: number; near: number; far: number };
const ATMOSPHERE: Record<Zone, Atmosphere> = {
  overworld: { sky: 0x8fd3ff, fog: 0xbfe6ff, near: 55, far: 165 }, // termina antes da borda dos shards visíveis
  sewer: { sky: 0x0d1410, fog: 0x0d1410, near: 8, far: 45 },
};
const TEST_ATMOSPHERE: Atmosphere = { sky: 0xffffff, fog: 0xffffff, near: 60, far: 160 };

/** Junta as áreas: altura do chão, limites, clima e as tampas que ligam uma à outra. */
export class World implements CameraWorld {
  readonly sewer: Sewer;
  readonly manholes: ManholeCover[];
  readonly shards: ShardManager;
  private readonly overworld: Overworld | null = null;
  private readonly fog = new THREE.Fog(0xbfe6ff, 55, 165);
  private readonly sky = new THREE.Color(0x8fd3ff);

  /** Tampa do esgoto no mundo de cima (marcada no minimapa). */
  readonly surfaceLid = new THREE.Vector3(5, 0, 8);
  /** Onde ficam as barracas dos vendedores: o ponto mais plano perto de cada VENDOR.SPOTS (vazio no mundo de testes). */
  readonly vendorSpots: THREE.Vector3[];

  constructor(private readonly scene: THREE.Scene, assets: Assets, anisotropy: number, readonly mode: WorldMode = 'normal') {
    scene.background = this.sky;
    scene.fog = this.fog;
    this.applyAtmosphere('overworld');
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5a8a3a, 0.9 * Math.PI));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6 * Math.PI);
    sun.position.set(30, 60, 20);
    scene.add(sun);

    const surfaceLid = this.surfaceLid;
    this.vendorSpots = mode === 'normal' ? VENDOR.SPOTS.map(([x, z]) => Overworld.flattestNear(x, z)) : [];
    const groups = new Map<ShardId, THREE.Object3D>();
    if (mode === 'test') new TestArena(scene);
    else {
      this.overworld = new Overworld(scene, assets, anisotropy, [surfaceLid, ...this.vendorSpots]);
      for (const [id, group] of this.overworld.shards) groups.set(id, group);
    }
    const sewerGroup = new THREE.Group();
    sewerGroup.name = `shard ${SHARD.SEWER}`;
    scene.add(sewerGroup);
    groups.set(SHARD.SEWER, sewerGroup);
    this.sewer = new Sewer(sewerGroup, assets, anisotropy, Sewer.newSeed());
    this.shards = new ShardManager(groups);
    const grate = assets.pixel('grate');
    this.manholes = [
      new ManholeCover(scene, grate, surfaceLid, this.sewer.entry, this.groundAt),          // `to` acompanha cada masmorra nova
      new ManholeCover(scene, grate, this.sewer.exitLid.clone(), new THREE.Vector3(5, 0, 10), this.groundAt),
    ];
  }

  zoneOf(p: THREE.Vector3): Zone { return Sewer.contains(p.x) ? 'sewer' : 'overworld'; }
  sameZone(a: THREE.Vector3, b: THREE.Vector3): boolean { return this.zoneOf(a) === this.zoneOf(b); }

  private surfaceHeight(x: number, z: number): number { return this.mode === 'test' ? TestArena.height() : Overworld.height(x, z); }

  readonly groundAt = (x: number, z: number): number => (Sewer.contains(x) ? this.sewer.height(x, z) : this.surfaceHeight(x, z));

  /** Chão sob alguém; pontes só seguram quem já está na altura delas. */
  groundUnder(p: THREE.Vector3): number {
    return Sewer.contains(p.x) ? this.sewer.height(p.x, p.z, p.y >= -0.05) : this.surfaceHeight(p.x, p.z);
  }

  clampToZone(p: THREE.Vector3): void {
    if (Sewer.contains(p.x)) { this.sewer.clamp(p); return; }
    p.x = clamp(p.x, -OVERWORLD.HALF, OVERWORLD.HALF);
    p.z = clamp(p.z, -OVERWORLD.HALF, OVERWORLD.HALF);
  }

  /** Na água rasa (canal do esgoto ou mar da praia) anda devagar. */
  isWading(p: THREE.Vector3): boolean {
    if (Sewer.contains(p.x)) return p.y < SEWER.WATER_Y + 0.05;
    return this.mode === 'normal' && p.y < OVERWORLD.SEA_Y + 0.05;
  }

  constrainCamera(cameraPos: THREE.Vector3, lookAt: THREE.Vector3): void {
    if (Sewer.contains(lookAt.x)) this.sewer.clampCamera(cameraPos, lookAt);
  }

  manholeNear(p: THREE.Vector3): ManholeCover | undefined { return this.manholes.find((m) => m.isNear(p)); }

  applyAtmosphere(zone: Zone): void {
    const a = zone === 'overworld' && this.mode === 'test' ? TEST_ATMOSPHERE : ATMOSPHERE[zone];
    this.sky.set(a.sky); this.fog.color.set(a.fog); this.fog.near = a.near; this.fog.far = a.far;
    this.scene.background = this.sky;
  }

  /** Gera um esgoto novo e leva a tampa de saída para a sala de entrada dele. */
  regenerateSewer(seed: number): void {
    this.sewer.regenerate(seed);
    this.manholes[1]!.relocate(this.sewer.exitLid);
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.sewer.update(dt, focus);
    this.overworld?.update(focus);
  }
}
