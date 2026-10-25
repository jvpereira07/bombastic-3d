import type { Player } from '../entities/Player';

export type ItemId = 'potion' | 'sombrero' | 'maraca';
export type Ability = 'dash' | 'maraca';

interface BaseItem { id: ItemId; name: string; description: string; icon: string; maxStack: number }

/** Consumível: usar gasta uma unidade se `use` devolver true. */
export interface ConsumableItem extends BaseItem { kind: 'consumable'; use(player: Player): boolean }
/** Equipamento: fica com o jogador e libera habilidades; `layer` é a camada desenhada sobre o sprite. */
export interface EquipmentItem extends BaseItem { kind: 'equipment'; grants: Ability[]; layer?: 'hat' }

export type ItemDef = ConsumableItem | EquipmentItem;

export const ITEMS: Record<ItemId, ItemDef> = {
  potion: {
    id: 'potion', name: 'Poção de vida', description: 'Recupera 40 de vida. Beba com Q.', icon: 'potion', maxStack: 9, kind: 'consumable',
    use: (player) => player.heal(40),
  },
  sombrero: {
    id: 'sombrero', name: 'Chapéu do Ligeirinho', description: 'Libera o dash (Shift), que atropela inimigos pelo caminho.', icon: 'sombrero', maxStack: 1, kind: 'equipment',
    grants: ['dash'], layer: 'hat',
  },
  maraca: {
    id: 'maraca', name: 'Maraca', description: 'Arma de segunda mão que ataca de longe. G troca com a espada.', icon: 'maraca', maxStack: 1, kind: 'equipment', grants: ['maraca'],
  },
};
