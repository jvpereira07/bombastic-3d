import * as THREE from 'three';
import { BOSS, ROW } from '../config';
import { Paratrooper } from '../boss/Paratrooper';
import { BombRat } from '../entities/BombRat';
import { Gator } from '../entities/Gator';
import { Rat } from '../entities/Rat';
import type { Game } from '../Game';
import { TestArena } from '../world/TestArena';

/** Quadro de uma folha usado como ícone: [colunas, linhas, coluna, linha]. */
type Frame = readonly [number, number, number, number];
interface Entry { label: string; icon?: string; frame?: Frame; run(at: THREE.Vector3): void }

/** Menu do mundo de testes (tecla C): invoca coisas à frente do jogador e atalhos de depuração. */
export class CreativeMenu {
  private static readonly SPAWN_DISTANCE = 6;
  private readonly root = document.createElement('div');

  constructor(private readonly game: Game) {
    const spawn: Entry[] = [
      { label: 'Rato', icon: 'rat_walk', frame: [5, 4, 0, ROW.FRONT], run: (p) => game.spawn(new Rat(game, p.x, p.z)) },
      { label: 'Rato-bomba', icon: 'bomb', frame: [5, 4, 0, ROW.FRONT], run: (p) => game.spawn(new BombRat(game, p.x, p.z, false)) },
      { label: 'Paraquedista', icon: 'para', frame: [4, 2, 0, 0], run: (p) => game.spawn(new Paratrooper(game, p.x, p.z)) },
      { label: 'Jacaré (no rio)', icon: 'gator', frame: [20, 6, 0, 2], run: (p) => game.spawn(new Gator(game, TestArena.RIVER_X, p.z)) },
      { label: 'Poção', icon: 'potion', run: (p) => game.dropItem('potion', p.x, p.z) },
      { label: 'Chapéu', icon: 'sombrero', run: (p) => game.dropItem('sombrero', p.x, p.z) },
      { label: 'Explosão', icon: 'boom', frame: [9, 1, 2, 0], run: (p) => game.explode(p.clone().setY(game.world.groundAt(p.x, p.z))) },
    ];
    const actions: Entry[] = [
      { label: 'Curar', run: () => game.player.heal(Infinity) },
      { label: 'Limpar inimigos', run: () => game.clearEnemies() },
      { label: 'Ir ao início', run: () => this.teleport(new THREE.Vector3(0, 0, 0)) },
      { label: 'Ir à arena do chefe', run: () => this.teleport(BOSS.CENTER.clone().setZ(BOSS.CENTER.z - 14)) },
    ];

    this.root.id = 'creative';
    this.root.hidden = true;
    this.root.innerHTML = '<h2>Menu criativo</h2><p>Clique para invocar à frente do jogador · C ou Esc fecha</p>';
    this.root.append(this.grid(spawn, 'spawn'), this.grid(actions, 'actions'));
    document.body.append(this.root);

    game.input.onKey(['KeyC'], () => this.toggle());
    game.input.onKey(['Escape'], () => this.toggle(false));
  }

  get open(): boolean { return !this.root.hidden; }

  toggle(open = !this.open): void {
    this.root.hidden = !open;
    if (open && document.pointerLockElement) document.exitPointerLock();
  }

  private grid(entries: Entry[], kind: string): HTMLElement {
    const grid = document.createElement('div');
    grid.className = `grid ${kind}`;
    for (const entry of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      if (entry.icon) {
        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.style.backgroundImage = `url(${this.game.assets.url(entry.icon)})`;
        const [cols, rows, col, row] = entry.frame ?? [1, 1, 0, 0];
        icon.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
        icon.style.backgroundPosition = `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`;
        button.append(icon);
      }
      button.append(entry.label);
      button.addEventListener('click', () => entry.run(this.spawnPoint()));
      grid.append(button);
    }
    return grid;
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
