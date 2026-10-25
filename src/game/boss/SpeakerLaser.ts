import * as THREE from 'three';
import { cameraRight } from '../../engine/math';
import type { Game } from '../Game';

export type LaserPhase = 'idle' | 'charge' | 'fire';

/**
 * Laser 3D da caixa de som: na carga o chefe puxa a caixa e uma linha vermelha mira;
 * no disparo, um feixe verde persegue onde o jogador estava há um instante (atraso de TRAIL_DELAY),
 * então quem continua se mexendo escapa e quem para é alcançado.
 */
export class SpeakerLaser {
  static readonly CHARGE = 0.75;
  static readonly FIRE = 2.6;
  private static readonly DAMAGE = 14;
  private static readonly MAX_LENGTH = 50;
  private static readonly TRAIL_DELAY = 0.55;  // s de atraso entre o jogador e o ponto que o feixe persegue
  private static readonly TURN_RATE = 4;        // rad/s; rápido o bastante para colar no rastro atrasado

  phase: LaserPhase = 'idle';
  timer = 0;
  private readonly dir = new THREE.Vector3(0, 0, 1);
  private readonly outer: THREE.Mesh;
  private readonly core: THREE.Mesh;
  private readonly aim: THREE.Mesh;
  private readonly impactLight = new THREE.PointLight(0x5cff8a, 0, 18, 0);
  private readonly speakerGlow = new THREE.PointLight(0x5cff8a, 0, 10, 0);
  private stopHum: (() => void) | null = null;
  /** Rastro do jogador (tempo, posição) para mirar no passado. */
  private readonly trail: { t: number; p: THREE.Vector3 }[] = [];
  private clock = 0;

  constructor(private readonly game: Game, private readonly origin: () => THREE.Vector3) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
    const glow = (color: number, opacity: number): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    this.outer = new THREE.Mesh(geo, glow(0x39ff7a, 0.55));
    this.core = new THREE.Mesh(geo, glow(0xeaffef, 1));
    this.aim = new THREE.Mesh(geo, glow(0xff3355, 0.7));
    for (const m of [this.outer, this.core, this.aim]) { m.visible = false; game.scene.add(m); }
    game.scene.add(this.impactLight, this.speakerGlow);
  }

  get active(): boolean { return this.phase !== 'idle'; }
  get chargeProgress(): number { return 1 - this.timer / SpeakerLaser.CHARGE; }

  /** Posição da caixa de som: no alto, à esquerda do sprite (relativo à câmera). */
  static speakerPosition(bossPos: THREE.Vector3, cameraYaw: number): THREE.Vector3 {
    return bossPos.clone().add(new THREE.Vector3(0, 7.4, 0)).addScaledVector(cameraRight(cameraYaw), -1.1);
  }

  start(): void {
    this.phase = 'charge'; this.timer = SpeakerLaser.CHARGE;
    this.game.sfx.laserCharge();
  }

  stop(): void {
    this.phase = 'idle';
    this.trail.length = 0;
    this.outer.visible = this.core.visible = this.aim.visible = false;
    this.impactLight.intensity = this.speakerGlow.intensity = 0;
    this.stopHum?.(); this.stopHum = null;
  }

  /** Devolve true quando o disparo termina. `enraged` vira mais rápido. */
  update(dt: number, enraged: boolean): boolean {
    const from = this.origin(), target = this.game.player.pos.clone().add(new THREE.Vector3(0, 1, 0));
    this.timer -= dt; this.clock += dt;
    this.trail.push({ t: this.clock, p: target.clone() });
    while (this.trail.length > 1 && this.trail[1]!.t <= this.clock - SpeakerLaser.TRAIL_DELAY) this.trail.shift();
    const delayed = this.trail[0]!.p;
    this.speakerGlow.position.copy(from);
    if (this.phase === 'charge') {
      this.dir.copy(target).sub(from).normalize();
      this.aim.visible = this.timer < SpeakerLaser.CHARGE * 0.6;
      this.place(this.aim, from, 0.04 + Math.random() * 0.02);
      this.speakerGlow.intensity = this.chargeProgress * 2 * Math.PI;
      if (this.timer <= 0) {
        // trava a mira um pouco ao lado do jogador: dá tempo de reagir
        this.phase = 'fire'; this.timer = SpeakerLaser.FIRE;
        this.aim.visible = false; this.outer.visible = this.core.visible = true;
        this.dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() < 0.5 ? -1 : 1) * 0.35);
        this.stopHum = this.game.sfx.laserHum();
      }
      return false;
    }
    if (this.phase !== 'fire') return false;

    const want = delayed.clone().sub(from).normalize(), angle = this.dir.angleTo(want);
    if (angle > 1e-4) {
      const axis = new THREE.Vector3().crossVectors(this.dir, want).normalize();
      this.dir.applyAxisAngle(axis, Math.min(angle, SpeakerLaser.TURN_RATE * (enraged ? 1.4 : 1) * dt));
    }
    const pulse = 1 + Math.sin(performance.now() / 40) * 0.15;
    const length = this.place(this.outer, from, 0.45 * pulse);
    this.place(this.core, from, 0.16 * pulse);
    this.impactLight.position.copy(from).addScaledVector(this.dir, length).y += 0.5;
    this.impactLight.intensity = 2.5 * Math.PI; this.speakerGlow.intensity = 2 * Math.PI;

    const player = this.game.player;
    if (!player.dead) {
      const along = Math.max(0, Math.min(length, target.clone().sub(from).dot(this.dir)));
      if (from.clone().addScaledVector(this.dir, along).distanceTo(target) < 0.9) {
        player.hurt(SpeakerLaser.DAMAGE, new THREE.Vector3(-this.dir.z, 0, this.dir.x).normalize());
      }
    }
    if (this.timer <= 0) { this.stop(); return true; }
    return false;
  }

  /** Estica o cilindro da origem até o chão (ou o alcance máximo); devolve o comprimento. */
  private place(mesh: THREE.Mesh, from: THREE.Vector3, radius: number): number {
    const length = this.dir.y < -0.001 ? Math.min(SpeakerLaser.MAX_LENGTH, from.y / -this.dir.y) : SpeakerLaser.MAX_LENGTH;
    mesh.position.copy(from).addScaledVector(this.dir, length / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.dir);
    mesh.scale.set(radius, length, radius);
    return length;
  }
}
