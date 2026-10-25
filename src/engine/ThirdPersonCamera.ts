import * as THREE from 'three';
import { clamp, damp } from './math';

export interface CameraWorld {
  groundAt(x: number, z: number): number;
  /** Ajusta a posição da câmera para ficar dentro de áreas fechadas. */
  constrainCamera(cameraPos: THREE.Vector3, lookAt: THREE.Vector3): void;
}

/** Órbita em volta do alvo: giro livre, inclinação limitada, seguimento suave e sem atravessar o chão. */
export class ThirdPersonCamera {
  yaw = Math.PI; pitch = 0.3; distance = 9;
  private targetYaw = Math.PI; private targetPitch = 0.3; private targetDistance = 9;
  readonly lookAt = new THREE.Vector3();
  private static readonly SENSITIVITY = 0.0025;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly world: CameraWorld) {}

  rotate(dx: number, dy: number): void {
    this.targetYaw -= dx * ThirdPersonCamera.SENSITIVITY;
    this.targetPitch = clamp(this.targetPitch + dy * ThirdPersonCamera.SENSITIVITY, -0.15, 1.2);
  }

  /** Puxa o giro para `yaw` (pelo lado mais curto); usado pela trava de mira. */
  face(yaw: number, dt: number): void {
    const diff = Math.atan2(Math.sin(yaw - this.targetYaw), Math.cos(yaw - this.targetYaw));
    this.targetYaw += diff * damp(8, dt);
  }

  zoom(delta: number): void { this.targetDistance = clamp(this.targetDistance + delta * 0.01, 4, 20); }

  /** Teleporte: corta a suavização. */
  snapTo(target: THREE.Vector3): void { this.lookAt.copy(target); }

  update(dt: number, target: THREE.Vector3): void {
    const k = damp(18, dt);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.distance += (this.targetDistance - this.distance) * damp(8, dt);
    this.lookAt.lerp(target, damp(12, dt));

    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(this.distance);
    const pos = this.lookAt.clone().add(offset);
    pos.y = Math.max(pos.y, this.world.groundAt(pos.x, pos.z) + 0.6);
    this.world.constrainCamera(pos, this.lookAt);
    this.camera.position.copy(pos);
    this.camera.lookAt(this.lookAt);
  }
}
