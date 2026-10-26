import { isChamber, type DungeonLayout } from '../../engine/procedural/DungeonGenerator';
import { Tile, isWalkable } from '../../engine/procedural/TileGrid';
import type { Game } from '../Game';

/** Cores das células no mapa (no tom dos menus). */
const COLORS: Record<number, [number, number, number]> = {
  [Tile.Floor]: [255, 227, 170], [Tile.Water]: [90, 160, 200], [Tile.Bridge]: [184, 101, 43],
};
const WALL: [number, number, number] = [74, 35, 16];

/**
 * Minimapa do esgoto com névoa: só aparece o que o jogador já viu (um raio em volta dele
 * e a sala inteira ao entrar). Pequeno no canto, seguindo o jogador; N abre o mapa inteiro.
 */
export class Minimap {
  private static readonly SIGHT = 6;   // células reveladas em volta do jogador
  private static readonly ZOOM = 4;    // px por célula no mapa do canto
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
  expanded = false;

  constructor(private readonly game: Game) {
    this.frame.id = 'minimap';
    this.frame.hidden = true;
    this.frame.append(this.canvas, Object.assign(document.createElement('span'), { className: 'mm-key', textContent: 'N' }));
    document.body.append(this.frame);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
    game.input.onKey(['KeyN'], () => { this.expanded = !this.expanded; });
  }

  update(): void {
    const { player, world } = this.game;
    const inSewer = world.zoneOf(player.pos) === 'sewer' && !player.dead;
    this.frame.hidden = !inSewer;
    if (!inSewer) return;
    if (world.sewer.layout !== this.layout) this.reset(world.sewer.layout);
    const me = world.sewer.cellOf(player.pos.x, player.pos.z);
    this.reveal(me.x, me.y);
    if (this.dirty) { this.fogCtx.putImageData(this.fogData, 0, 0); this.dirty = false; }
    this.draw(me);
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
    const [r, g, b] = wall ? WALL : COLORS[t]!;
    this.fogData.data.set([r, g, b, 255], i * 4);
    this.dirty = true;
  }

  private draw(me: { x: number; y: number }): void {
    const layout = this.layout!, { width, height } = layout.grid;
    const big = this.expanded;
    this.frame.classList.toggle('expanded', big);
    const size = big ? Math.min(innerWidth, innerHeight) - 140 : 168;
    const zoom = big ? size / Math.max(width, height) : Minimap.ZOOM;
    if (this.canvas.width !== size) { this.canvas.width = this.canvas.height = size; }
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2a1206';
    ctx.fillRect(0, 0, size, size);
    // grande: mapa todo parado; pequeno: centrado no jogador
    const ox = big ? (size - width * zoom) / 2 : size / 2 - (me.x + 0.5) * zoom;
    const oy = big ? (size - height * zoom) / 2 : size / 2 - (me.y + 0.5) * zoom;
    ctx.drawImage(this.fog, ox, oy, width * zoom, height * zoom);

    const at = (p: { x: number; y: number }): [number, number] => [ox + (p.x + 0.5) * zoom, oy + (p.y + 0.5) * zoom];
    const seen = (p: { x: number; y: number }): boolean => this.explored[p.y * width + p.x] === 1;
    const dot = (p: { x: number; y: number }, color: string, r: number): void => {
      const [x, y] = at(p);
      ctx.fillStyle = color; ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    };
    const exit = this.game.world.sewer.exitCell;
    if (seen(exit)) dot(exit, '#9fd36a', Math.max(4, zoom * 0.9));
    const boss = layout.boss, bc = { x: Math.floor(boss.x + boss.w / 2), y: Math.floor(boss.y + boss.h / 2) };
    if (seen(bc)) dot(bc, '#e8664a', Math.max(5, zoom * 1.2));

    // jogador: seta para onde a câmera olha
    const [px, py] = at(me), yaw = this.game.camera.yaw, s = Math.max(6, zoom * 1.6);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-yaw); // câmera olha para (-sen, -cos) no plano; a seta desenhada aponta para cima
    ctx.fillStyle = '#f7b541'; ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.7); ctx.lineTo(0, s * 0.3); ctx.lineTo(-s * 0.7, s * 0.7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
