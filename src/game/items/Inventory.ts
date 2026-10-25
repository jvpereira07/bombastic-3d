import { ITEMS, type Ability, type ItemId } from './items';
import type { Player } from '../entities/Player';

/** Itens que o jogador carrega. Equipamentos ficam equipados ao serem pegos. */
export class Inventory {
  private readonly stacks = new Map<ItemId, number>();
  private readonly listeners: (() => void)[] = [];

  count(id: ItemId): number { return this.stacks.get(id) ?? 0; }
  has(id: ItemId): boolean { return this.count(id) > 0; }

  canAdd(id: ItemId): boolean { return this.count(id) < ITEMS[id].maxStack; }

  add(id: ItemId, amount = 1): boolean {
    if (!this.canAdd(id)) return false;
    this.stacks.set(id, Math.min(ITEMS[id].maxStack, this.count(id) + amount));
    this.changed();
    return true;
  }

  /** Usa um consumível; devolve se teve efeito. */
  use(id: ItemId, player: Player): boolean {
    const item = ITEMS[id];
    if (item.kind !== 'consumable' || !this.has(id) || !item.use(player)) return false;
    this.stacks.set(id, this.count(id) - 1);
    this.changed();
    return true;
  }

  hasAbility(ability: Ability): boolean {
    return [...this.stacks.keys()].some((id) => {
      const item = ITEMS[id];
      return item.kind === 'equipment' && this.has(id) && item.grants.includes(ability);
    });
  }

  hasLayer(layer: 'hat'): boolean {
    return [...this.stacks.keys()].some((id) => { const item = ITEMS[id]; return item.kind === 'equipment' && item.layer === layer && this.has(id); });
  }

  onChange(listener: () => void): void { this.listeners.push(listener); }
  private changed(): void { for (const l of this.listeners) l(); }
}
