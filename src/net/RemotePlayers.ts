import * as THREE from 'three';
import type { Assets } from '../engine/Assets';
import { Billboard } from '../engine/Billboard';
import { SpriteSheet } from '../engine/SpriteSheet';
import { facingRow } from '../engine/math';
import { Player } from '../game/entities/Player';
import { PLAYER } from '../game/config';
import { NET, type PlayerState, type PoseSheet } from './protocol';

const COLS: Record<PoseSheet, number> = { move: 7, attack: 18, maraca: 18, dash: 8 };
const HAT: Record<PoseSheet, string> = { move: 'hat_move', attack: 'hat_atk', maraca: 'hat_atk', dash: 'hat_dash' };

interface Snapshot { t: number; s: PlayerState }

/** Outro jogador: corpo + chapéu como o local, posição interpolada entre os estados recebidos. */
class RemotePlayer {
  private readonly snapshots: Snapshot[] = [];
  /** Onde está agora (interpolado) — os mobs do meu shard miram aqui. */
  readonly pos = new THREE.Vector3();
  dead = false;
  active = false;
  private readonly body: Billboard;
  private readonly hat: Billboard;
  private readonly label: THREE.Sprite;
  private readonly sheets: Record<PoseSheet, { body: SpriteSheet; hat: SpriteSheet }>;

  constructor(private readonly scene: THREE.Scene, assets: Assets, readonly id: string, name: string) {
    const make = (sheet: PoseSheet, texture: THREE.Texture): { body: SpriteSheet; hat: SpriteSheet } =>
      ({ body: new SpriteSheet(texture, COLS[sheet], 4), hat: new SpriteSheet(assets.texture(HAT[sheet]), COLS[sheet], 4) });
    this.sheets = {
      move: make('move', assets.texture('player_move')), attack: make('attack', assets.texture('player_atk')),
      maraca: make('maraca', Player.maracaAttackTexture(assets)), dash: make('dash', assets.texture('player_dash')),
    };
    this.body = new Billboard(scene, this.sheets.move.body.texture, PLAYER.SPRITE_SIZE, PLAYER.SPRITE_SIZE, 0.04);
    this.hat = new Billboard(scene, this.sheets.move.hat.texture, PLAYER.SPRITE_SIZE, PLAYER.SPRITE_SIZE, 0.04);
    this.label = RemotePlayer.nameTag(name);
    this.body.visible = this.hat.visible = this.label.visible = false;
    scene.add(this.label);
  }

  private static nameTag(name: string): THREE.Sprite {
    const canvas = document.createElement('canvas'), g = canvas.getContext('2d');
    if (!g) throw new Error('Canvas 2D indisponível');
    canvas.width = 256; canvas.height = 48;
    g.font = '700 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = Math.min(248, g.measureText(name).width + 24);
    g.fillStyle = '#1d2340cc'; g.beginPath(); g.roundRect((256 - w) / 2, 4, w, 40, 20); g.fill();
    g.fillStyle = '#ffffff'; g.fillText(name, 128, 25);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(2.4, 0.45, 1);
    return sprite;
  }

  push(s: PlayerState, now: number): void {
    this.snapshots.push({ t: now, s });
    if (this.snapshots.length > 20) this.snapshots.shift();
  }

  /** Desenha no instante `now - INTERP_DELAY`, entre os dois estados que o cercam. */
  render(now: number, cameraYaw: number, cameraPos: THREE.Vector3): void {
    const at = now - NET.INTERP_DELAY, list = this.snapshots;
    if (!list.length) return;
    let i = list.length - 1;
    while (i > 0 && list[i]!.t > at) i--;
    const a = list[i]!, b = list[Math.min(i + 1, list.length - 1)]!;
    const k = b.t > a.t ? THREE.MathUtils.clamp((at - a.t) / (b.t - a.t), 0, 1) : 0;
    const pos = new THREE.Vector3(...a.s.p).lerp(new THREE.Vector3(...b.s.p), k);
    const s = k < 0.5 ? a.s : b.s;
    this.pos.copy(pos); this.dead = s.dead; this.active = true;

    const sheets = this.sheets[s.sheet], row = facingRow(s.d[0], s.d[1], cameraYaw);
    sheets.body.setFrame(row, Math.min(s.col, COLS[s.sheet] - 1));
    sheets.hat.texture.offset.copy(sheets.body.texture.offset);
    this.body.setMap(sheets.body.texture); this.hat.setMap(sheets.hat.texture);
    const tint = s.dead ? 0x777777 : 0xffffff;
    this.body.tint(tint); this.hat.tint(tint);
    this.body.position.copy(pos);
    this.hat.position.copy(pos).addScaledVector(cameraPos.clone().sub(pos).normalize(), 0.03);
    this.label.position.copy(pos).setY(pos.y + PLAYER.SPRITE_SIZE + 0.35);
    this.body.visible = this.label.visible = true;
    this.hat.visible = s.hat;
  }

  hide(): void { this.body.visible = this.hat.visible = this.label.visible = this.active = false; this.snapshots.length = 0; }

  dispose(): void {
    this.body.dispose(); this.hat.dispose();
    this.scene.remove(this.label); this.label.material.map?.dispose(); this.label.material.dispose();
    for (const s of Object.values(this.sheets)) { s.body.dispose(); s.hat.dispose(); }
  }
}

/** Todos os jogadores remotos; recebe eventos do NetClient e desenha a cada quadro. */
export class RemotePlayers {
  private readonly players = new Map<string, RemotePlayer>();

  constructor(private readonly scene: THREE.Scene, private readonly assets: Assets) {}

  get count(): number { return this.players.size; }

  join(id: string, name: string): void {
    if (!this.players.has(id)) this.players.set(id, new RemotePlayer(this.scene, this.assets, id, name));
  }

  leave(id: string): void { this.players.get(id)?.dispose(); this.players.delete(id); }

  states(list: { id: string; s: PlayerState }[], gone: string[], now: number): void {
    for (const { id, s } of list) this.players.get(id)?.push(s, now);
    for (const id of gone) this.players.get(id)?.hide(); // saiu do raio de interesse
  }

  /** Jogadores remotos que estão sendo desenhados agora. */
  active(): { id: string; pos: THREE.Vector3; dead: boolean }[] {
    return [...this.players.values()].filter((p) => p.active);
  }

  clear(): void { for (const id of [...this.players.keys()]) this.leave(id); }

  render(now: number, cameraYaw: number, cameraPos: THREE.Vector3): void {
    for (const p of this.players.values()) p.render(now, cameraYaw, cameraPos);
  }
}
