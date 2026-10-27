import type { Player } from '../entities/Player';

export type ItemId = 'potion' | 'sombrero' | 'sword' | 'maraca' | 'bow';
export type Ability = 'dash';
/** Onde um equipamento (que não é arma) é vestido. */
export type GearKind = 'head' | 'chest' | 'legs' | 'feet' | 'accessory';
/** Armas que vão na mão (duas por vez: uma na mão, a outra nas costas). */
export type Weapon = 'sword' | 'maraca' | 'bow';

interface BaseItem { id: ItemId; name: string; description: string; icon: string; maxStack: number }

/** Consumível: usar gasta uma unidade se `use` devolver true. */
export interface ConsumableItem extends BaseItem { kind: 'consumable'; use(player: Player): boolean }
/** Equipamento: fica com o jogador e libera habilidades; `layer` é a camada desenhada sobre o sprite. */
export interface EquipmentItem extends BaseItem { kind: 'equipment'; grants: Ability[]; layer?: 'hat'; weapon?: Weapon; gear?: GearKind }

export type ItemDef = ConsumableItem | EquipmentItem;

export const ITEMS: Record<ItemId, ItemDef> = {
  potion: {
    id: 'potion', name: 'Poção de vida', description: 'Recupera 40 de vida. Beba com Q.', icon: 'potion', maxStack: 9, kind: 'consumable',
    use: (player) => player.heal(40),
  },
  sombrero: {
    id: 'sombrero', name: 'Chapéu do Ligeirinho', description: 'Libera o dash (Shift), que atropela inimigos pelo caminho.', icon: 'sombrero', maxStack: 1, kind: 'equipment',
    grants: ['dash'], layer: 'hat', gear: 'head',
  },
  sword: {
    id: 'sword', name: 'Espada', description: 'Corte de perto em combo de 3 golpes; o último empurra forte.', icon: 'sword', maxStack: 1,
    kind: 'equipment', grants: [], weapon: 'sword',
  },
  maraca: {
    id: 'maraca', name: 'Maraca', description: 'Ondas sonoras de média distância, também em combo.', icon: 'maraca', maxStack: 1,
    kind: 'equipment', grants: [], weapon: 'maraca',
  },
  bow: {
    id: 'bow', name: 'Arco', description: 'Flechas de longe, lentas de puxar mas fortes (2 de dano).', icon: 'bow', maxStack: 1,
    kind: 'equipment', grants: [], weapon: 'bow',
  },
};
