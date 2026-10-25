import { rnd } from '../engine/math';
import type { Game } from './Game';
import { CUCARACHA } from './config';
import { Cucaracha } from './entities/Cucaracha';
import { Rat } from './entities/Rat';
import type { Zone } from './world/World';

/** Popula e repõe os ratos comuns. No esgoto, nada renasce enquanto o chefe luta. */
export class RatSpawner {
  private static readonly RESPAWN_DELAY = 8000;
  private static readonly SAFE_DISTANCE = 30;

  constructor(private readonly game: Game) {}

  populate(): void {
    for (let i = 0; i < 12; i++) this.spawn('overworld');
    for (let i = 0; i < 3; i++) this.spawnTroupe('overworld');
    this.populateSewer();
  }

  populateSewer(): void {
    for (let i = 0; i < 7; i++) this.spawn('sewer');
    this.spawnTroupe('sewer');
  }

  /** Bando de cucarachas juntinho num ponto; cada uma sabe seu lugar na roda. */
  spawnTroupe(zone: Zone): void {
    let x: number, z: number;
    if (zone === 'sewer') ({ x, z } = this.game.world.sewer.randomFloor());
    else {
      const player = this.game.player.pos;
      do { x = rnd(-70, 70); z = rnd(-70, 70); } while (Math.hypot(x - player.x, z - player.z) < RatSpawner.SAFE_DISTANCE);
    }
    if (!this.game.maySpawnAt(x, z)) return;
    const size = Math.round(rnd(...CUCARACHA.TROUPE));
    for (let i = 0; i < size; i++) {
      const a = (i / size) * Math.PI * 2;
      this.game.spawn(new Cucaracha(this.game, x + Math.cos(a) * 1.2, z + Math.sin(a) * 1.2, i, size));
    }
  }

  spawn(zone: Zone): void {
    if (zone === 'sewer') {
      const p = this.game.world.sewer.randomFloor();
      if (this.game.maySpawnAt(p.x, p.z)) this.game.spawn(new Rat(this.game, p.x, p.z));
      return;
    }
    const player = this.game.player.pos;
    let x: number, z: number;
    do { x = rnd(-80, 80); z = rnd(-80, 80); } while (Math.hypot(x - player.x, z - player.z) < RatSpawner.SAFE_DISTANCE);
    if (this.game.maySpawnAt(x, z)) this.game.spawn(new Rat(this.game, x, z));
  }

  scheduleRespawn(zone: Zone): void {
    window.setTimeout(() => {
      if (zone === 'sewer' && this.game.boss.fighting) return;
      this.spawn(zone);
    }, RatSpawner.RESPAWN_DELAY);
  }
}
