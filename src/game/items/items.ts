import type { BootPalette } from '../entities/bootSprites';
import type { Player } from '../entities/Player';

export type ItemId = 'potion' | 'sombrero' | 'sword' | 'maraca' | 'bow' | 'waterBoots' | 'wingBoots' | 'springBoots' | 'icarusWings';
export type Ability = 'dash' | 'waterWalk' | 'doubleJump' | 'bounce' | 'flight';
/** Onde um equipamento (que não é arma) é vestido. */
export type GearKind = 'head' | 'chest' | 'legs' | 'feet' | 'accessory';
/** Armas que vão na mão (duas por vez: uma na mão, a outra nas costas). */
export type Weapon = 'sword' | 'maraca' | 'bow';

interface BaseItem { id: ItemId; name: string; description: string; icon: string; maxStack: number }

/** Consumível: usar gasta uma unidade se `use` devolver true. */
export interface ConsumableItem extends BaseItem { kind: 'consumable'; use(player: Player): boolean }
/** Equipamento: fica com o jogador e libera habilidades; `layer` é a camada desenhada sobre o sprite. */
export interface EquipmentItem extends BaseItem { kind: 'equipment'; grants: Ability[]; layer?: 'hat'; weapon?: Weapon; gear?: GearKind; boots?: BootPalette }

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
  waterBoots: {
    id: 'waterBoots', name: 'Bota das Águas', description: 'Anda sobre a água sem afundar nem ficar lento.', icon: 'bota_agua', maxStack: 1,
    kind: 'equipment', grants: ['waterWalk'], gear: 'feet', boots: { dark: 0x13324f, base: 0x2f7fc4, light: 0x8fd3ff },
  },
  wingBoots: {
    id: 'wingBoots', name: 'Bota Alada', description: 'Espaço no ar dá um segundo pulo, batendo as asinhas.', icon: 'bota_alada', maxStack: 1,
    kind: 'equipment', grants: ['doubleJump'], gear: 'feet', boots: { dark: 0x7a5a18, base: 0xf1e4c2, light: 0xffffff },
  },
  springBoots: {
    id: 'springBoots', name: 'Bota Trampolim', description: 'Ao cair de um pulo, quica de volta bem mais alto.', icon: 'bota_mola', maxStack: 1,
    kind: 'equipment', grants: ['bounce'], gear: 'feet', boots: { dark: 0x3a0f0f, base: 0xd23a32, light: 0xf5c518 },
  },
  icarusWings: {
    id: 'icarusWings', name: 'Asas de Ícaro', icon: 'asas_icaro', maxStack: 1,
    description: 'Segure Espaço no ar para voar por até 10 s; acabou o voo e ainda segurando, plana. Recarrega no chão.',
    kind: 'equipment', grants: ['flight'], gear: 'accessory',
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
