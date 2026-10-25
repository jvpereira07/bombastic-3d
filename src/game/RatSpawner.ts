import { rnd } from '../engine/math';
import type { Game } from './Game';
import { Rat } from './entities/Rat';
import { Sewer } from './world/Sewer';
import type { Zone } from './world/World';

/** Popula e repõe os ratos comuns. No esgoto, nada renasce enquanto o chefe luta. */
export class RatSpawner {
  private static readonly RESPAWN_DELAY = 8000;
  private static readonly SAFE_DISTANCE = 30;

  constructor(private readonly game: Game) {}

  populate(): void {
    for (let i = 0; i < 12; i++) this.spawn('overworld');
    this.populateSewer();
  }

  populateSewer(): void { for (let i = 0; i < 7; i++) this.spawn('sewer'); }

  spawn(zone: Zone): void {
    if (zone === 'sewer') {
      const p = Sewer.randomWalkway();
      this.game.spawn(new Rat(this.game, p.x, p.z));
      return;
    }
    const player = this.game.player.pos;
    let x: number, z: number;
    do { x = rnd(-80, 80); z = rnd(-80, 80); } while (Math.hypot(x - player.x, z - player.z) < RatSpawner.SAFE_DISTANCE);
    this.game.spawn(new Rat(this.game, x, z));
  }

  scheduleRespawn(zone: Zone): void {
    window.setTimeout(() => {
      if (zone === 'sewer' && this.game.boss.fighting) return;
      this.spawn(zone);
    }, RatSpawner.RESPAWN_DELAY);
  }
}
