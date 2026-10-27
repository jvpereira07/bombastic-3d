import { ITEMS, type Ability, type GearKind, type ItemId } from './items';
import type { Player } from '../entities/Player';

/** Slot vestível: as quatro peças de armadura e os cinco acessórios. */
export type GearSlot = 'head' | 'chest' | 'legs' | 'feet' | `accessory${0 | 1 | 2 | 3 | 4}`;
export const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet'] as const satisfies readonly GearSlot[];
export const ACCESSORY_SLOTS = ['accessory0', 'accessory1', 'accessory2', 'accessory3', 'accessory4'] as const satisfies readonly GearSlot[];

/** Slots que aceitam um tipo de equipamento (acessório cabe em qualquer um dos cinco). */
const slotsFor = (gear: GearKind): readonly GearSlot[] => (gear === 'accessory' ? ACCESSORY_SLOTS : [gear]);

/**
 * Itens que o jogador carrega e o que ele está vestindo. Equipamentos vestíveis vão para um
 * slot livre ao serem pegos; habilidades e camadas visuais vêm só do que está vestido.
 * (Armas ficam nas mãos do Player, não aqui.)
 */
export class Inventory {
  private readonly stacks = new Map<ItemId, number>();
  private readonly worn = new Map<GearSlot, ItemId>();
  private readonly listeners: (() => void)[] = [];

  count(id: ItemId): number { return this.stacks.get(id) ?? 0; }
  has(id: ItemId): boolean { return this.count(id) > 0; }

  /** Itens que o jogador tem, na ordem em que foram pegos. */
  entries(): { id: ItemId; count: number }[] {
    return [...this.stacks].filter(([, n]) => n > 0).map(([id, count]) => ({ id, count }));
  }

  canAdd(id: ItemId): boolean { return this.count(id) < ITEMS[id].maxStack; }

  add(id: ItemId, amount = 1): boolean {
    if (!this.canAdd(id)) return false;
    this.stacks.set(id, Math.min(ITEMS[id].maxStack, this.count(id) + amount));
    if (!this.isWorn(id)) this.wear(id, false); // veste sozinho se houver slot livre
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

  // ---------- equipamento vestido ----------

  wornIn(slot: GearSlot): ItemId | null { return this.worn.get(slot) ?? null; }
  isWorn(id: ItemId): boolean { return [...this.worn.values()].includes(id); }

  /**
   * Veste o item num slot compatível: o livre primeiro; sem livre e com `replace`, troca o
   * do primeiro slot. Devolve se vestiu.
   */
  wear(id: ItemId, replace = true): boolean {
    const item = ITEMS[id];
    if (item.kind !== 'equipment' || !item.gear || !this.has(id) || this.isWorn(id)) return false;
    const slots = slotsFor(item.gear), slot = slots.find((s) => !this.worn.has(s)) ?? (replace ? slots[0] : undefined);
    if (!slot) return false;
    this.worn.set(slot, id);
    this.changed();
    return true;
  }

  takeOff(slot: GearSlot): void {
    if (this.worn.delete(slot)) this.changed();
  }

  hasAbility(ability: Ability): boolean {
    return [...this.worn.values()].some((id) => { const item = ITEMS[id]; return item.kind === 'equipment' && item.grants.includes(ability); });
  }

  hasLayer(layer: 'hat'): boolean {
    return [...this.worn.values()].some((id) => { const item = ITEMS[id]; return item.kind === 'equipment' && item.layer === layer; });
  }

  onChange(listener: () => void): void { this.listeners.push(listener); }
  private changed(): void { for (const l of this.listeners) l(); }
}
