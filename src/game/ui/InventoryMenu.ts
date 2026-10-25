import type { Assets } from '../../engine/Assets';
import type { Player } from '../entities/Player';
import { ITEMS, type ItemId } from '../items/items';
import { badge, button, h, icon, Modal, Slot } from './components';

/** Inventário (Tab ou I): grade de itens, detalhes do item escolhido e o que está equipado. */
export class InventoryMenu extends Modal {
  private static readonly SLOTS = 12;
  private readonly slots: Slot[] = [];
  private readonly hatSlot = new Slot();
  private readonly handSlot = new Slot();
  private readonly details = h('div', { className: 'inv-details' });
  private selected: ItemId | null = null;

  constructor(private readonly player: Player, private readonly assets: Assets) {
    super('Inventário', 'Tab ou I fecha · clique duas vezes para usar', 'lg');
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
      h('div', { className: 'inv-equip-row' }, this.handSlot.el, h('span', { text: 'Mão' })));
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
    else if (item.grants.includes('maraca')) this.player.wield(this.player.weapon === 'maraca' ? 'sword' : 'maraca');
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
    const maraca = this.player.weapon === 'maraca';
    this.handSlot.set({ url: this.assets.url(maraca ? ITEMS.maraca.icon : 'sword'), label: maraca ? ITEMS.maraca.name : 'Espada' });
    this.renderDetails();
  }

  private renderDetails(): void {
    const id = this.selected;
    if (!id) {
      this.details.replaceChildren(h('div', { className: 'inv-empty' }, h('b', { text: 'Mochila vazia' }), h('p', { text: 'Explore o mapa e o esgoto para achar itens.' })));
      return;
    }
    const item = ITEMS[id];
    const count = this.player.inventory.count(id);
    const tags = item.kind === 'consumable' ? [badge('Consumível', 'green'), badge(`${count}/${item.maxStack}`, 'blue')] : [badge('Equipamento', 'gold')];
    let action: HTMLButtonElement;
    if (item.kind === 'consumable') action = button('Usar', { variant: 'primary', hotkey: 'Q', onClick: () => this.useSelected() });
    else if (item.grants.includes('maraca')) {
      const wielding = this.player.weapon === 'maraca';
      action = button(wielding ? 'Voltar à espada' : 'Empunhar', { variant: wielding ? 'secondary' : 'primary', hotkey: 'G', onClick: () => this.useSelected() });
    } else {
      action = button('Equipado', { variant: 'ghost' });
      action.disabled = true;
    }
    this.details.replaceChildren(
      h('div', { className: 'inv-preview' }, icon(this.assets.url(item.icon))),
      h('h3', { className: 'inv-name', text: item.name }),
      h('div', { className: 'ui-row' }, ...tags),
      h('p', { className: 'inv-desc', text: item.description }),
      action,
    );
  }
}
