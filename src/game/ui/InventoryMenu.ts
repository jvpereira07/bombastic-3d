import type { Assets } from '../../engine/Assets';
import type { Hand, Player } from '../entities/Player';
import { ITEMS, type ItemId, type Weapon } from '../items/items';
import { badge, button, h, icon, Modal, Slot } from './components';

/** Inventário (Tab ou I): grade de itens, detalhes do item escolhido e o que está equipado. */
export class InventoryMenu extends Modal {
  private static readonly SLOTS = 12;
  private readonly slots: Slot[] = [];
  private readonly hatSlot = new Slot();
  /** Mão 1 e mão 2 (teclas 1 e 2); clicar empunha. */
  private readonly handSlots = [new Slot('1'), new Slot('2')] as const;
  private readonly details = h('div', { className: 'inv-details' });
  private selected: ItemId | null = null;

  constructor(private readonly player: Player, private readonly assets: Assets) {
    super('Inventário', 'Tab ou I fecha · duas armas equipadas: a da mão vai na mão, a outra nas costas', 'lg');
    const grid = h('div', { className: 'inv-grid' });
    for (let i = 0; i < InventoryMenu.SLOTS; i++) {
      const slot = new Slot();
      slot.el.addEventListener('click', () => this.select(i));
      slot.el.addEventListener('dblclick', () => this.useSelected());
      this.slots.push(slot);
      grid.append(slot.el);
    }
    const equip = h('div', { className: 'inv-equip' },
      h('div', { className: 'inv-equip-row' }, this.hatSlot.el, h('span', { text: 'Cabeça' })),
      ...this.handSlots.map((slot, i) => {
        slot.el.addEventListener('click', () => { this.player.selectHand(i as Hand); this.refresh(); });
        return h('div', { className: 'inv-equip-row' }, slot.el, h('span', { text: `Mão ${i + 1}` }));
      }));
    this.body.append(h('div', { className: 'inv-layout' },
      h('div', {}, h('h3', { className: 'ui-label', text: 'Mochila' }), grid, h('h3', { className: 'ui-label', text: 'Equipado' }), equip),
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
    const item = ITEMS[id];
    if (item.kind === 'consumable') { if (id === 'potion') this.player.drinkPotion(); }
    else if (item.weapon) this.equipWeapon(item.weapon);
    this.refresh();
  }

  private refresh(): void {
    const { inventory } = this.player;
    const entries = inventory.entries();
    this.slots.forEach((slot, i) => {
      const e = entries[i];
      slot.set(e ? { url: this.assets.url(ITEMS[e.id].icon), label: ITEMS[e.id].name, count: e.count } : null);
      slot.selected = !!e && e.id === this.selected;
    });
    this.hatSlot.set(inventory.hasLayer('hat') ? { url: this.assets.url(ITEMS.sombrero.icon), label: ITEMS.sombrero.name } : null);
    this.handSlots.forEach((slot, i) => {
      const w = this.player.hands[i];
      slot.set(w ? { url: this.assets.url(weaponItem(w).icon), label: weaponItem(w).name } : null);
      slot.selected = !!w && i === this.player.activeHand;
    });
    this.renderDetails();
  }

  private renderDetails(): void {
    const id = this.selected;
    if (!id) {
      this.details.replaceChildren(h('div', { className: 'inv-empty' }, h('b', { text: 'Mochila vazia' }), h('p', { text: 'Explore o mapa e o esgoto para achar itens.' })));
      return;
    }
    const item = ITEMS[id];
    let action: HTMLButtonElement;
    if (item.kind === 'consumable') action = button('Usar', { variant: 'primary', hotkey: 'Q', onClick: () => this.useSelected() });
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
      this.details.replaceChildren(...this.header(id), h('div', { className: 'ui-stack' }, handBtn(0), handBtn(1)));
      return;
    } else {
      action = button('Equipado', { variant: 'ghost' });
      action.disabled = true;
    }
    this.details.replaceChildren(...this.header(id), action);
  }

  /** Imagem, nome, etiquetas e descrição do item. */
  private header(id: ItemId): HTMLElement[] {
    const item = ITEMS[id], count = this.player.inventory.count(id);
    const tags = item.kind === 'consumable' ? [badge('Consumível', 'green'), badge(`${count}/${item.maxStack}`, 'blue')]
      : item.weapon ? [badge('Arma', 'red')] : [badge('Equipamento', 'gold')];
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

/** Item de cada arma (para ícone e nome). */
const weaponItem = (w: Weapon): (typeof ITEMS)[ItemId] => ITEMS[w];
