import type { Assets } from '../../engine/Assets';
import { ROW } from '../config';
import type { Hand, Player } from '../entities/Player';
import { ACCESSORY_SLOTS, ARMOR_SLOTS, type GearSlot } from '../items/Inventory';
import { ITEMS, type ItemId, type Weapon } from '../items/items';
import { badge, button, h, icon, Modal, Slot } from './components';

const SLOT_NAMES: Record<(typeof ARMOR_SLOTS)[number], string> = { head: 'Capacete', chest: 'Peitoral', legs: 'Calça', feet: 'Bota' };

/**
 * Inventário (Tab ou I): o jogador no centro, armadura à esquerda (capacete, peitoral, calça, bota),
 * as duas mãos à direita e cinco acessórios embaixo; depois a mochila e os detalhes do item escolhido.
 */
export class InventoryMenu extends Modal {
  private static readonly SLOTS = 12;
  private readonly slots: Slot[] = [];
  private readonly gearSlots = new Map<GearSlot, Slot>();
  /** Mão 1 e mão 2 (teclas 1 e 2); clicar empunha. */
  private readonly handSlots = [new Slot('1'), new Slot('2')] as const;
  private readonly figure = h('div', { className: 'inv-figure' });
  private readonly details = h('div', { className: 'inv-details' });
  private selected: ItemId | null = null;

  constructor(private readonly player: Player, private readonly assets: Assets) {
    super('Inventário', 'Tab ou I fecha · clique duplo veste ou tira · duas armas: a da mão vai na mão, a outra nas costas', 'xl');
    const grid = h('div', { className: 'inv-grid' });
    for (let i = 0; i < InventoryMenu.SLOTS; i++) {
      const slot = new Slot();
      slot.el.addEventListener('click', () => this.select(i));
      slot.el.addEventListener('dblclick', () => this.useSelected());
      this.slots.push(slot);
      grid.append(slot.el);
    }
    const gearSlot = (key: GearSlot, label: string): HTMLElement => {
      const slot = new Slot();
      slot.el.addEventListener('click', () => { const id = this.player.inventory.wornIn(key); if (id) { this.selected = id; this.refresh(); } });
      slot.el.addEventListener('dblclick', () => { this.player.inventory.takeOff(key); this.refresh(); });
      this.gearSlots.set(key, slot);
      return h('div', { className: 'inv-gear' }, slot.el, h('span', { text: label }));
    };
    const hands = this.handSlots.map((slot, i) => {
      slot.el.addEventListener('click', () => { this.player.selectHand(i as Hand); this.refresh(); });
      return h('div', { className: 'inv-gear' }, slot.el, h('span', { text: `Mão ${i + 1}` }));
    });
    const doll = h('div', { className: 'inv-doll' },
      h('div', { className: 'inv-col' }, ...ARMOR_SLOTS.map((k) => gearSlot(k, SLOT_NAMES[k]))),
      this.figure,
      h('div', { className: 'inv-col' }, ...hands));
    const accessories = h('div', { className: 'inv-accessories' }, ...ACCESSORY_SLOTS.map((k, i) => gearSlot(k, `Acessório ${i + 1}`)));
    this.body.append(h('div', { className: 'inv-layout' },
      h('div', {}, h('h3', { className: 'ui-label', text: 'Equipado' }), doll, accessories),
      h('div', {}, h('h3', { className: 'ui-label', text: 'Mochila' }), grid),
      this.details));
    player.inventory.onChange(() => { if (this.open) this.refresh(); });
  }

  protected override onOpen(): void {
    if (this.selected && !this.player.inventory.has(this.selected)) this.selected = null;
    this.selected ??= this.player.inventory.entries()[0]?.id ?? null;
    this.refresh();
  }

  private select(index: number): void {
    const entry = this.player.inventory.entries()[index];
    if (!entry) return;
    this.selected = entry.id;
    this.refresh();
  }

  private useSelected(): void {
    const id = this.selected;
    if (!id) return;
    const item = ITEMS[id], { inventory } = this.player;
    if (item.kind === 'consumable') { if (id === 'potion') this.player.drinkPotion(); }
    else if (item.weapon) this.equipWeapon(item.weapon);
    else if (item.gear) { if (inventory.isWorn(id)) this.takeOff(id); else inventory.wear(id); }
    this.refresh();
  }

  private takeOff(id: ItemId): void {
    const { inventory } = this.player;
    for (const key of this.gearSlots.keys()) if (inventory.wornIn(key) === id) inventory.takeOff(key);
  }

  private refresh(): void {
    const { inventory } = this.player;
    const entries = inventory.entries();
    const content = (id: ItemId | null): { url: string; label: string } | null => (id ? { url: this.assets.url(ITEMS[id].icon), label: ITEMS[id].name } : null);
    this.slots.forEach((slot, i) => {
      const e = entries[i];
      slot.set(e ? { ...content(e.id)!, count: e.count } : null);
      slot.selected = !!e && e.id === this.selected;
    });
    for (const [key, slot] of this.gearSlots) {
      const id = inventory.wornIn(key);
      slot.set(content(id));
      slot.selected = !!id && id === this.selected;
    }
    this.handSlots.forEach((slot, i) => {
      const w = this.player.hands[i] ?? null;
      slot.set(content(w));
      slot.selected = !!w && i === this.player.activeHand;
    });
    this.renderFigure();
    this.renderDetails();
  }

  /** O jogador de frente, com o chapéu se estiver vestido. */
  private renderFigure(): void {
    const frame = [7, 4, 0, ROW.FRONT] as const;
    const layers = [icon(this.assets.url('player_move'), [...frame])];
    if (this.player.inventory.hasLayer('hat')) layers.push(icon(this.assets.url('hat_move'), [...frame]));
    this.figure.replaceChildren(...layers);
  }

  private renderDetails(): void {
    const id = this.selected;
    if (!id) {
      this.details.replaceChildren(h('div', { className: 'inv-empty' }, h('b', { text: 'Mochila vazia' }), h('p', { text: 'Explore o mapa e o esgoto para achar itens.' })));
      return;
    }
    const item = ITEMS[id], { inventory } = this.player;
    let actions: HTMLElement[];
    if (item.kind === 'consumable') actions = [button('Usar', { variant: 'primary', hotkey: 'Q', onClick: () => this.useSelected() })];
    else if (item.weapon) {
      const weapon = item.weapon;
      const handBtn = (hand: Hand): HTMLButtonElement => {
        const here = this.player.hands[hand] === weapon;
        const b = button(here ? `Na mão ${hand + 1}` : `Equipar na mão ${hand + 1}`, {
          variant: here ? 'ghost' : 'primary', hotkey: String(hand + 1),
          onClick: () => { this.player.equip(weapon, hand); this.refresh(); },
        });
        b.disabled = here;
        return b;
      };
      actions = [h('div', { className: 'ui-stack' }, handBtn(0), handBtn(1))];
    } else if (item.gear) {
      const worn = inventory.isWorn(id);
      actions = [button(worn ? 'Desequipar' : 'Equipar', { variant: worn ? 'secondary' : 'primary', onClick: () => this.useSelected() })];
    } else {
      const b = button('Equipado', { variant: 'ghost' });
      b.disabled = true;
      actions = [b];
    }
    this.details.replaceChildren(...this.header(id), ...actions);
  }

  /** Imagem, nome, etiquetas e descrição do item. */
  private header(id: ItemId): HTMLElement[] {
    const item = ITEMS[id], count = this.player.inventory.count(id);
    const tags = item.kind === 'consumable' ? [badge('Consumível', 'green'), badge(`${count}/${item.maxStack}`, 'blue')]
      : item.weapon ? [badge('Arma', 'red')]
        : [badge('Equipamento', 'gold'), ...(this.player.inventory.isWorn(id) ? [badge('Vestido', 'green')] : [])];
    return [
      h('div', { className: 'inv-preview' }, icon(this.assets.url(item.icon))),
      h('h3', { className: 'inv-name', text: item.name }),
      h('div', { className: 'ui-row' }, ...tags),
      h('p', { className: 'inv-desc', text: item.description }),
    ];
  }

  /** Clique duplo numa arma: vai para a mão livre, ou troca a mão ativa. */
  private equipWeapon(weapon: Weapon): void {
    const hands = this.player.hands;
    if (hands.includes(weapon)) return;
    this.player.equip(weapon, hands[1] === null ? 1 : this.player.activeHand);
  }
}
