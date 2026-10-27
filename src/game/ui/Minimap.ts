import { isChamber, type DungeonLayout } from '../../engine/procedural/DungeonGenerator';
import { Tile, isWalkable } from '../../engine/procedural/TileGrid';
import { OVERWORLD } from '../config';
import type { Game } from '../Game';
import { Overworld } from '../world/Overworld';

type Rgb = [number, number, number];
interface Marker { p: { x: number; y: number }; color: string; r: number }

/** Cor média de uma imagem (reduzida para 8x8 e tirada a média), opcionalmente multiplicada por um tom. */
function averageColor(img: CanvasImageSource, tint: Rgb = [255, 255, 255]): Rgb {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [128, 128, 128];
  ctx.drawImage(img, 0, 0, 8, 8);
  const data = ctx.getImageData(0, 0, 8, 8).data, sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 128) continue;
    sum[0]! += data[i]!; sum[1]! += data[i + 1]!; sum[2]! += data[i + 2]!; n++;
  }
  return sum.map((v, k) => Math.round((v / Math.max(1, n)) * tint[k]! / 255)) as Rgb;
}

/**
 * Minimapa: no esgoto, com névoa (só aparece o que o jogador já viu: um raio em volta dele e a sala
 * inteira ao entrar); no mundo de cima, o mapa todo com relevo e a tampa do esgoto.
 * Pequeno no canto, seguindo o jogador; N abre o mapa inteiro.
 */
export class Minimap {
  private static readonly SIGHT = 6;   // células reveladas em volta do jogador
  private static readonly ZOOM = 4;    // px por célula no mapa do canto (célula do esgoto = 4 m: 1 px por metro)
  /** Metros por pixel do mapa do mundo de cima. */
  private static readonly WORLD_M_PER_PX = 2;
  private overworld: HTMLCanvasElement | null = null;
  private readonly frame = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  /** Mapa revelado, 1 px por célula. */
  private readonly fog = document.createElement('canvas');
  private fogCtx!: CanvasRenderingContext2D;
  private fogData!: ImageData;
  private explored = new Uint8Array(0);
  private layout: DungeonLayout | null = null;
  private dirty = false;
  /** Cor de cada tipo de célula, tirada das texturas do esgoto (piso, água e tijolo das paredes). */
  private readonly colors: Record<number, Rgb>;
  private readonly wall: Rgb;
  expanded = false;

  constructor(private readonly game: Game) {
    this.frame.id = 'minimap';
    this.frame.hidden = true;
    this.frame.append(this.canvas, Object.assign(document.createElement('span'), { className: 'mm-key', textContent: 'N' }));
    document.body.append(this.frame);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
    const image = (name: string): CanvasImageSource => game.assets.texture(name).image as CanvasImageSource;
    const floor = averageColor(image('floor'));
    this.colors = {
      [Tile.Floor]: floor,
      [Tile.Water]: averageColor(image('water'), [0xb8, 0xd8, 0xa0]), // mesmo tom do material da água
      [Tile.Bridge]: floor.map((v) => Math.round(v * 0.72)) as Rgb,   // ponte é piso: mais escura para destacar
    };
    this.wall = averageColor(image('brick'));
    game.input.onKey(['KeyN'], () => { this.expanded = !this.expanded; });
  }

  update(): void {
    const { player, world } = this.game;
    const zone = world.zoneOf(player.pos);
    const show = !player.dead && (zone === 'sewer' || world.mode === 'normal'); // mundo de teste não tem mapa
    this.frame.hidden = !show;
    if (!show) return;
    if (zone === 'sewer') this.updateSewer(); else this.updateOverworld();
  }

  private updateSewer(): void {
    const { player, world } = this.game;
    if (world.sewer.layout !== this.layout) this.reset(world.sewer.layout);
    const me = world.sewer.cellOf(player.pos.x, player.pos.z);
    this.reveal(me.x, me.y);
    if (this.dirty) { this.fogCtx.putImageData(this.fogData, 0, 0); this.dirty = false; }
    const { width } = this.layout!.grid;
    const seen = (p: { x: number; y: number }): boolean => this.explored[p.y * width + p.x] === 1;
    const markers: Marker[] = [];
    const exit = world.sewer.exitCell;
    if (seen(exit)) markers.push({ p: exit, color: '#9fd36a', r: 0.9 });
    const boss = this.layout!.boss, bc = { x: Math.floor(boss.x + boss.w / 2), y: Math.floor(boss.y + boss.h / 2) };
    if (seen(bc)) markers.push({ p: bc, color: '#e8664a', r: 1.2 });
    this.draw('Mapa do esgoto', this.fog, me, Minimap.ZOOM, markers);
  }

  /** Mundo de cima: mapa inteiro já conhecido (desenhado uma vez a partir do relevo). */
  private updateOverworld(): void {
    const { player, world } = this.game;
    this.overworld ??= Minimap.buildOverworld();
    const toPx = (x: number, z: number): { x: number; y: number } =>
      ({ x: (x + OVERWORLD.HALF) / Minimap.WORLD_M_PER_PX - 0.5, y: (z + OVERWORLD.HALF) / Minimap.WORLD_M_PER_PX - 0.5 });
    const lid = world.surfaceLid;
    this.draw('Mapa do mundo', this.overworld, toPx(player.pos.x, player.pos.z), Minimap.WORLD_M_PER_PX, // 1 px por metro, como no esgoto
      [{ p: toPx(lid.x, lid.z), color: '#9fd36a', r: 1.5 }, ...this.game.vendors.map((v) => ({ p: toPx(v.pos.x, v.pos.z), color: '#ffd23a', r: 1.5 }))]);
  }

  /** Uma amostra do terreno a cada WORLD_M_PER_PX metros. */
  private static buildOverworld(): HTMLCanvasElement {
    const size = Math.ceil((OVERWORLD.HALF * 2) / Minimap.WORLD_M_PER_PX);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const img = ctx.createImageData(size, size);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const c = Overworld.mapColor(-OVERWORLD.HALF + (px + 0.5) * Minimap.WORLD_M_PER_PX, -OVERWORLD.HALF + (py + 0.5) * Minimap.WORLD_M_PER_PX);
      const hex = c.getHex(); // volta para sRGB (THREE.Color guarda em linear)
      img.data.set([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255], (py * size + px) * 4);
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /** Masmorra nova: zera a névoa. */
  private reset(layout: DungeonLayout): void {
    this.layout = layout;
    const { width, height } = layout.grid;
    this.fog.width = width; this.fog.height = height;
    const ctx = this.fog.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.fogCtx = ctx;
    this.fogData = ctx.createImageData(width, height);
    this.explored = new Uint8Array(width * height);
  }

  private reveal(cx: number, cy: number): void {
    const layout = this.layout!, r = Minimap.SIGHT;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.mark(x, y);
    }
    // entrou numa sala: ela aparece inteira, com as paredes
    const room = layout.rooms.find((q) => isChamber(q) && cx >= q.x && cx < q.x + q.w && cy >= q.y && cy < q.y + q.h);
    if (room) for (let y = room.y - 1; y <= room.y + room.h; y++) for (let x = room.x - 1; x <= room.x + room.w; x++) this.mark(x, y);
  }

  private mark(x: number, y: number): void {
    const grid = this.layout!.grid;
    if (!grid.inside(x, y)) return;
    const i = y * grid.width + x;
    if (this.explored[i]) return;
    const t = grid.get(x, y);
    // rocha só aparece como parede quando encosta em algo andável
    const wall = !isWalkable(t) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx = 0, dy = 0]) => isWalkable(grid.get(x + dx, y + dy)));
    if (!isWalkable(t) && !wall) return;
    this.explored[i] = 1;
    const [r, g, b] = wall ? this.wall : this.colors[t]!;
    this.fogData.data.set([r, g, b, 255], i * 4);
    this.dirty = true;
  }

  /**
   * Desenha `source` (1 px = 1 célula do mapa): pequeno, centrado em `me` com `zoom` px por célula;
   * grande (N), o mapa inteiro parado. Marcadores têm raio em células.
   */
  private draw(title: string, source: HTMLCanvasElement, me: { x: number; y: number }, zoomSmall: number, markers: Marker[]): void {
    const { width, height } = source;
    const big = this.expanded;
    this.frame.classList.toggle('expanded', big);
    this.frame.dataset.title = `${title} · N fecha`;
    const size = big ? Math.min(innerWidth, innerHeight) - 140 : 168;
    const zoom = big ? size / Math.max(width, height) : zoomSmall;
    if (this.canvas.width !== size) { this.canvas.width = this.canvas.height = size; }
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2a1206';
    ctx.fillRect(0, 0, size, size);
    const ox = big ? (size - width * zoom) / 2 : size / 2 - (me.x + 0.5) * zoom;
    const oy = big ? (size - height * zoom) / 2 : size / 2 - (me.y + 0.5) * zoom;
    ctx.drawImage(source, ox, oy, width * zoom, height * zoom);

    const at = (p: { x: number; y: number }): [number, number] => [ox + (p.x + 0.5) * zoom, oy + (p.y + 0.5) * zoom];
    for (const m of markers) {
      const [x, y] = at(m.p);
      ctx.fillStyle = m.color; ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, Math.max(4, zoom * m.r), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // jogador: seta para onde a câmera olha
    const [px, py] = at(me), yaw = this.game.camera.yaw, s = Math.max(6, Math.min(12, zoom * 1.6));
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-yaw); // câmera olha para (-sen, -cos) no plano; a seta desenhada aponta para cima
    ctx.fillStyle = '#f7b541'; ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.7); ctx.lineTo(0, s * 0.3); ctx.lineTo(-s * 0.7, s * 0.7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
