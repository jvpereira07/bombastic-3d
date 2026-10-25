import * as THREE from 'three';
import type { Game } from '../game/Game';
import { Actor } from '../game/entities/Actor';
import { BombRat } from '../game/entities/BombRat';
import { Gator } from '../game/entities/Gator';
import { Rat } from '../game/entities/Rat';
import { shardAt, type ShardId } from '../game/world/shards';
import type { NetClient } from './NetClient';
import type { MobState } from './protocol';

/**
 * Mobs compartilhados por dono de shard:
 * - o dono simula os mobs do shard e manda o estado; os outros clientes têm fantoches (`puppet`);
 * - golpe num fantoche vira mensagem para quem o simula;
 * - mob que anda para um shard de outro dono é entregue (vai na lista uma última vez e vira fantoche);
 * - quando o dono muda, quem perdeu vira fantoche e quem ganhou assume os fantoches que já tem.
 */
export class MobSync {
  private owners = new Map<ShardId, string>();
  private counter = 0;

  constructor(private readonly game: Game, private readonly net: NetClient) {}

  /** Offline tudo é meu; online, só os shards em que o servidor me deu a posse. */
  owns(shard: ShardId): boolean {
    if (!this.net.connected) return true;
    return this.owners.get(shard) === this.net.id;
  }

  ownsAt(x: number, z: number): boolean { return this.owns(shardAt(x, z)); }

  private mobs(): Actor[] { return this.game.actors().filter((a) => a.netKind !== null && a.alive); }

  private byId(): Map<string, Actor> {
    const map = new Map<string, Actor>();
    for (const a of this.mobs()) if (a.netId) map.set(a.netId, a);
    return map;
  }

  /** A cada tick de rede: manda os mobs que simulo; os que saíram do meu território são entregues. */
  tick(): void {
    if (!this.net.connected) return;
    const list: MobState[] = [];
    for (const a of this.mobs()) {
      if (a.puppet || !a.canBeHit) continue;
      const mine = this.ownsAt(a.pos.x, a.pos.z);
      if (!mine && !a.netId) continue; // nunca foi anunciado e o shard é de outro: o dono de lá tem os dele
      a.netId ??= `${this.net.id}-${this.counter++}`;
      list.push(a.toNet());
      if (!mine) a.puppet = true;
    }
    this.net.sendMobs(list);
  }

  onOwners(owners: Record<string, string>): void {
    this.owners = new Map(Object.entries(owners));
    for (const a of this.mobs()) {
      const mine = this.ownsAt(a.pos.x, a.pos.z);
      if (!a.puppet && !mine) {
        if (a.netId) a.puppet = true;   // já anunciado: o novo dono segue a partir do fantoche dele
        else a.alive = false;           // mob local que ninguém mais conhece: o dono de lá tem os próprios
      } else if (a.puppet && mine) a.puppet = false; // herdei o shard: assumo a simulação
    }
  }

  onMobs(list: MobState[], gone: string[]): void {
    const known = this.byId();
    for (const m of list) {
      let a = known.get(m.id);
      if (a && !a.puppet) continue; // eu já simulo este (entrega em andamento)
      if (!a) {
        a = this.create(m);
        a.netId = m.id; a.puppet = true;
        this.game.spawn(a);
      }
      a.fromNet(m);
      if (this.ownsAt(m.p[0], m.p[2])) a.puppet = false; // veio para o meu shard: adoto
    }
    for (const id of gone) { const a = known.get(id); if (a?.puppet) a.alive = false; }
  }

  onHit(id: string, dir: [number, number, number]): void {
    const a = this.byId().get(id);
    if (a && !a.puppet) a.takeHit(new THREE.Vector3(...dir));
  }

  hit(a: Actor, dir: THREE.Vector3): void {
    if (a.netId) this.net.sendHit(a.netId, [dir.x, dir.y, dir.z]);
  }

  private create(m: MobState): Actor {
    const [x, , z] = m.p;
    if (m.k === 'bomb') return new BombRat(this.game, x, z, m.m);
    if (m.k === 'gator') return new Gator(this.game, x, z);
    return new Rat(this.game, x, z, m.m);
  }
}
