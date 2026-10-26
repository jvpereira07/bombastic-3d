import * as THREE from 'three';
import { isChamber } from '../../engine/procedural/DungeonGenerator';
import type { Game } from '../Game';

/**
 * Depuração (F3): painel com desempenho, posição, área/shard, entidades e estado do jogador,
 * e anéis no chão mostrando o raio de acerto de cada inimigo (vermelho = simulando, cinza = congelado).
 */
export class DebugOverlay {
  private readonly panel = document.createElement('pre');
  private readonly rings = new THREE.Group();
  private readonly ringGeo = new THREE.RingGeometry(0.94, 1, 32).rotateX(-Math.PI / 2);
  private readonly ringOn = new THREE.MeshBasicMaterial({ color: 0xe8664a, depthTest: false, transparent: true });
  private readonly ringOff = new THREE.MeshBasicMaterial({ color: 0x888888, depthTest: false, transparent: true });
  private frames = 0;
  private elapsed = 0;
  private fps = 0;
  private worst = 0;
  private worstShown = 0;
  private textTimer = 0;
  private last = performance.now();
  enabled = false;

  constructor(private readonly game: Game) {
    this.panel.id = 'debug';
    this.panel.hidden = true;
    document.body.append(this.panel);
    this.rings.renderOrder = 10;
    game.scene.add(this.rings);
    game.input.onKey(['F3'], () => this.toggle(), true);
  }

  toggle(on = !this.enabled): void {
    this.enabled = on;
    this.panel.hidden = !on;
    this.rings.visible = on;
  }

  update(dt: number): void {
    // fps pelo relógio real (o dt do jogo é limitado a 50 ms), medido sempre e mostrado só ligado
    const now = performance.now(), real = (now - this.last) / 1000;
    this.last = now;
    this.frames++; this.elapsed += real; this.worst = Math.max(this.worst, real);
    if (this.elapsed >= 0.5) {
      this.fps = this.frames / this.elapsed; this.worstShown = this.worst;
      this.frames = 0; this.elapsed = 0; this.worst = 0;
    }
    if (!this.enabled) return;
    this.updateRings();
    if ((this.textTimer -= dt) > 0) return;
    this.textTimer = 0.1; // texto 10x por segundo
    this.panel.textContent = this.text();
  }

  private updateRings(): void {
    const targets = this.game.hittables().filter((t) => t.canBeHit);
    while (this.rings.children.length < targets.length) this.rings.add(new THREE.Mesh(this.ringGeo, this.ringOn));
    this.rings.children.forEach((child, i) => {
      const t = targets[i], mesh = child as THREE.Mesh;
      mesh.visible = !!t;
      if (!t) return;
      mesh.position.set(t.pos.x, t.pos.y + 0.05, t.pos.z);
      mesh.scale.setScalar(t.hitRadius);
      mesh.material = this.game.world.shards.simulates(t.pos) ? this.ringOn : this.ringOff;
    });
  }

  private text(): string {
    const { game } = this, { player, world, camera } = game, p = player.pos;
    const info = game.engine.renderer.info;
    const zone = world.zoneOf(p);
    const counts = new Map<string, number>();
    for (const e of game.allEntities) counts.set(e.constructor.name, (counts.get(e.constructor.name) ?? 0) + 1);
    const byType = [...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ');
    const simulating = game.allEntities.filter((e) => world.shards.simulates(e.position)).length;
    const f = (v: number, d = 1): string => v.toFixed(d);

    const lines = [
      'Bombastic 3D · depuração (F3)',
      `FPS ${f(this.fps, 0)}  pior quadro ${f(this.worstShown * 1000, 0)} ms`,
      `desenho ${info.render.calls} chamadas · ${info.render.triangles} triângulos · ${info.memory.geometries} geometrias · ${info.memory.textures} texturas`,
      '',
      `posição ${f(p.x)} ${f(p.y)} ${f(p.z)}  chão ${f(world.groundAt(p.x, p.z))}`,
      `câmera giro ${f(camera.yaw, 2)} incl. ${f(camera.pitch, 2)} dist. ${f(camera.distance)}`,
      `área ${zone}  shard ${world.shards.playerShard ?? '-'}  visíveis ${world.shards.visible.size}  simulados ${world.shards.simulated.size}`,
    ];
    if (zone === 'sewer') {
      const { layout } = world.sewer, c = world.sewer.cellOf(p.x, p.z);
      const room = layout.rooms.find((r) => isChamber(r) && c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h)
        ?? layout.rooms.find((r) => c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h);
      lines.push(`esgoto semente ${layout.seed}  célula ${c.x},${c.y}  sala ${room ? `${room.kind} (${room.exits} saídas)` : 'corredor'}  salas ${layout.rooms.length}`);
    }
    const target = game.lockOn.target;
    lines.push(
      '',
      `entidades ${game.allEntities.length} (simulando ${simulating})`,
      byType,
      '',
      `vida ${f(player.hp, 0)}  stamina ${f(player.stamina, 0)}  arma ${player.weapon} (mão ${player.activeHand + 1})  combo ${player.comboStage}`,
      `arco ${player.bowCharge === null ? '-' : `${f(player.bowCharge * 100, 0)}%`}  trava ${target ? `${target.constructor.name} a ${f(target.pos.distanceTo(p))} m` : '-'}`,
      `online ${game.onlineStatus}`,
    );
    return lines.join('\n');
  }
}
