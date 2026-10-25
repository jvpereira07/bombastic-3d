import * as THREE from 'three';
import { ROW } from '../config';
import { Paratrooper } from '../boss/Paratrooper';
import { BombRat } from '../entities/BombRat';
import { Gator } from '../entities/Gator';
import { Rat } from '../entities/Rat';
import type { Game } from '../Game';
import { TestArena } from '../world/TestArena';
import { button, h, icon, Modal, tabs, type Frame } from './components';

interface Entry { label: string; icon?: string; frame?: Frame; run(at: THREE.Vector3): void }

/** Menu do mundo de testes (tecla C): invoca coisas à frente do jogador e atalhos de depuração. */
export class CreativeMenu extends Modal {
  private static readonly SPAWN_DISTANCE = 6;

  constructor(private readonly game: Game) {
    super('Menu criativo', 'Clique para invocar à frente do jogador · C ou Esc fecha');
    const mobs: Entry[] = [
      { label: 'Rato', icon: 'rat_walk', frame: [5, 4, 0, ROW.FRONT], run: (p) => game.spawn(new Rat(game, p.x, p.z)) },
      { label: 'Rato-bomba', icon: 'bomb', frame: [5, 4, 0, ROW.FRONT], run: (p) => game.spawn(new BombRat(game, p.x, p.z, false)) },
      { label: 'Paraquedista', icon: 'para', frame: [4, 2, 0, 0], run: (p) => game.spawn(new Paratrooper(game, p.x, p.z)) },
      { label: 'Jacaré (no rio)', icon: 'gator', frame: [20, 6, 0, 2], run: (p) => game.spawn(new Gator(game, TestArena.RIVER_X, p.z)) },
      { label: 'Explosão', icon: 'boom', frame: [9, 1, 2, 0], run: (p) => game.explode(p.clone().setY(game.world.groundAt(p.x, p.z))) },
    ];
    const items: Entry[] = [
      { label: 'Poção', icon: 'potion', run: (p) => game.dropItem('potion', p.x, p.z) },
      { label: 'Maraca', icon: 'maraca', run: (p) => game.dropItem('maraca', p.x, p.z) },
      { label: 'Chapéu', icon: 'sombrero', run: (p) => game.dropItem('sombrero', p.x, p.z) },
    ];
    const actions: Entry[] = [
      { label: 'Curar', run: () => game.player.heal(Infinity) },
      { label: 'Limpar inimigos', run: () => game.clearEnemies() },
      { label: 'Ir ao início', run: () => this.teleport(new THREE.Vector3(0, 0, 0)) },
      { label: 'Ir ao esgoto (novo)', run: () => game.enterSewer() },
      { label: 'Ir à arena do chefe', run: () => { const c = game.world.sewer.arena.center; this.teleport(c.clone().setZ(game.world.sewer.arena.minZ + 2)); } },
    ];
    this.body.append(tabs([
      { label: 'Inimigos', content: this.grid(mobs, 'tiles') },
      { label: 'Itens', content: this.grid(items, 'tiles') },
      { label: 'Ações', content: this.grid(actions, 'list') },
    ]));
    game.input.onKey(['KeyC'], () => { if (this.open || !Modal.anyOpen) this.toggle(); }, true);
  }

  private grid(entries: Entry[], kind: 'tiles' | 'list'): HTMLElement {
    return h('div', { className: `ui-grid ${kind}` }, ...entries.map((e) => button(e.label, {
      className: kind === 'tiles' ? 'tile' : '',
      icon: e.icon ? icon(this.game.assets.url(e.icon), e.frame) : undefined,
      onClick: () => e.run(this.spawnPoint()),
    })));
  }

  /** Ponto no chão à frente da câmera. */
  private spawnPoint(): THREE.Vector3 {
    const dir = this.game.engine.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const p = this.game.player.pos.clone().addScaledVector(dir, CreativeMenu.SPAWN_DISTANCE);
    this.game.world.clampToZone(p);
    return p;
  }

  private teleport(to: THREE.Vector3): void {
    const { game } = this;
    game.player.teleport(to);
    game.camera.snapTo(game.player.pos.clone().setY(game.player.pos.y + 1.8));
    game.world.applyAtmosphere(game.world.zoneOf(game.player.pos));
  }
}
