import * as THREE from 'three';
import { isChamber } from '../../engine/procedural/DungeonGenerator';
import type { Game } from '../Game';

interface ChromeMemory { usedJSHeapSize: number; jsHeapSizeLimit: number }

/**
 * Depuração (F3): painel com desempenho, posição, área/shard, entidades e estado do jogador,
 * e anéis no chão mostrando o raio de acerto de cada inimigo (vermelho = simulando, cinza = congelado).
 * Inclui gráfico do tempo de quadro e FPS do pior 1%; F4 copia um retrato em JSON para análise.
 */
export class DebugOverlay {
  private static readonly HISTORY = 240;      // quadros no gráfico (~4 s a 60 fps)
  private static readonly GRAPH_MAX_MS = 50;  // topo do gráfico
  private readonly root = document.createElement('div');
  private readonly panel = document.createElement('pre');
  private readonly graph = document.createElement('canvas');
  private readonly graphCtx: CanvasRenderingContext2D;
  private readonly history = new Float32Array(DebugOverlay.HISTORY);
  private head = 0;
  private filled = 0;
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
    this.root.id = 'debug';
    this.root.hidden = true;
    this.graph.width = DebugOverlay.HISTORY;
    this.graph.height = 56;
    this.root.append(this.graph, this.panel);
    document.body.append(this.root);
    const ctx = this.graph.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.graphCtx = ctx;
    this.rings.renderOrder = 10;
    game.scene.add(this.rings);
    game.input.onKey(['F3'], () => this.toggle(), true);
    game.input.onKey(['F4'], () => { if (this.enabled) void this.copy(); }, true);
  }

  toggle(on = !this.enabled): void {
    this.enabled = on;
    this.root.hidden = !on;
    this.rings.visible = on;
  }

  update(dt: number): void {
    // fps pelo relógio real (o dt do jogo é limitado a 50 ms), medido sempre e mostrado só ligado
    const now = performance.now(), real = (now - this.last) / 1000;
    this.last = now;
    this.frames++; this.elapsed += real; this.worst = Math.max(this.worst, real);
    this.history[this.head] = real * 1000;
    this.head = (this.head + 1) % DebugOverlay.HISTORY;
    this.filled = Math.min(this.filled + 1, DebugOverlay.HISTORY);
    if (this.elapsed >= 0.5) {
      this.fps = this.frames / this.elapsed; this.worstShown = this.worst;
      this.frames = 0; this.elapsed = 0; this.worst = 0;
    }
    if (!this.enabled) return;
    this.updateRings();
    this.drawGraph();
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

    const { timing, renderer } = game.engine, low = this.low1Fps(), mem = (performance as Performance & { memory?: ChromeMemory }).memory;
    const lines = [
      'Bombastic 3D · depuração (F3) · F4 copia JSON',
      `FPS ${f(this.fps, 0)}  pior 1% ${f(low, 0)}  pior quadro ${f(this.worstShown * 1000, 0)} ms`,
      `CPU update ${f(timing.update, 2)} ms · render ${f(timing.render, 2)} ms`,
      `desenho ${info.render.calls} chamadas · ${info.render.triangles} triângulos · ${info.memory.geometries} geometrias · ${info.memory.textures} texturas · ${info.programs?.length ?? 0} shaders`,
      `tela ${renderer.domElement.width}x${renderer.domElement.height} @${renderer.getPixelRatio()}x${mem ? `  heap JS ${f(mem.usedJSHeapSize / 2 ** 20, 0)}/${f(mem.jsHeapSizeLimit / 2 ** 20, 0)} MB` : ''}`,
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

  /** FPS médio do pior 1% dos quadros no histórico. */
  private low1Fps(): number {
    const sorted = Array.from(this.history.subarray(0, this.filled)).sort((a, b) => b - a);
    const worst = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 100)));
    return 1000 / Math.max(0.001, worst.reduce((s, v) => s + v, 0) / worst.length);
  }

  /** Barras do tempo de cada quadro; linhas de 60 fps (verde) e 30 fps (amarela). */
  private drawGraph(): void {
    const ctx = this.graphCtx, w = this.graph.width, h = this.graph.height, max = DebugOverlay.GRAPH_MAX_MS;
    ctx.clearRect(0, 0, w, h);
    for (const [ms, color] of [[1000 / 60, '#4ade80'], [1000 / 30, '#facc15']] as const) {
      ctx.fillStyle = color;
      ctx.fillRect(0, h - (ms / max) * h, w, 1);
    }
    for (let i = 0; i < this.filled; i++) {
      const ms = this.history[(this.head - this.filled + i + DebugOverlay.HISTORY) % DebugOverlay.HISTORY]!;
      ctx.fillStyle = ms > 1000 / 30 ? '#f87171' : ms > 1000 / 55 ? '#facc15' : '#4ade80';
      const bar = Math.min(h, (ms / max) * h);
      ctx.fillRect(w - this.filled + i, h - bar, 1, bar);
    }
  }

  /** Copia o painel atual em JSON (sem permissão de área de transferência, vai para o console). */
  private async copy(): Promise<void> {
    const p = this.game.player.pos, info = this.game.engine.renderer.info;
    const json = JSON.stringify({
      at: new Date().toISOString(), userAgent: navigator.userAgent,
      fps: this.fps, low1Fps: this.low1Fps(), worstFrameMs: this.worstShown * 1000, timingMs: this.game.engine.timing,
      render: { ...info.render }, memory: { ...info.memory }, programs: info.programs?.length ?? 0,
      position: [p.x, p.y, p.z], zone: this.game.world.zoneOf(p), shard: this.game.world.shards.playerShard,
      entities: this.game.allEntities.length, text: this.panel.textContent,
    }, null, 2);
    try { await navigator.clipboard.writeText(json); } catch { console.info(json); }
  }
}
