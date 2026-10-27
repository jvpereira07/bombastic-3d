import type { Assets } from '../../engine/Assets';
import type { Sfx } from '../audio/Sfx';
import { VENDOR } from '../config';
import type { Player } from '../entities/Player';
import { ITEMS } from '../items/items';
import { badge, button, h, icon, Modal } from './components';

type Offer = (typeof VENDOR.OFFERS)[number];

const GREETINGS = [
  'Opa! Poção fresquinha, direto do caldeirão.',
  'Vai encarar o esgoto? Leva umas poções.',
  'Moeda na mão, poção na mochila!',
  'Os ratos pagam a conta: cada um deixa umas moedas.',
];

/** Loja do vendedor (E perto da barraca): saldo de moedas e pacotes de poção para comprar. */
export class ShopMenu extends Modal {
  private readonly greeting = h('p', { className: 'shop-say' });
  private readonly wallet = h('div', { className: 'shop-wallet' });
  private readonly list = h('div', { className: 'shop-list' });

  constructor(private readonly player: Player, private readonly assets: Assets, private readonly sfx: Sfx) {
    super('Barraca de poções', 'E ou Esc fecha · cada poção recupera 40 de vida (Q bebe)', 'md');
    const portrait = h('div', { className: 'shop-portrait' }, icon(assets.url('vendedor'), [VENDOR.FRAMES, 1, 0, 0]));
    this.body.append(h('div', { className: 'shop-head' }, portrait, h('div', {}, this.greeting, this.wallet)), this.list);
  }

  protected override onOpen(): void {
    this.greeting.textContent = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]!;
    this.refresh();
  }

  private refresh(): void {
    const { coins, inventory } = this.player, potion = ITEMS.potion;
    const room = potion.maxStack - inventory.count('potion');
    this.wallet.replaceChildren(icon(this.assets.url('moeda')), h('b', { text: String(coins) }), h('span', { text: 'moedas' }),
      badge(`${inventory.count('potion')}/${potion.maxStack} poções`, 'blue'));
    this.list.replaceChildren(...VENDOR.OFFERS.map((offer) => {
      const affordable = coins >= offer.price, fits = room >= offer.potions;
      const why = !fits ? 'Mochila cheia' : !affordable ? `Faltam ${offer.price - coins}` : '';
      const buy = button(why || 'Comprar', { variant: why ? 'ghost' : 'primary', onClick: () => this.buy(offer) });
      buy.disabled = !!why;
      return h('div', { className: 'shop-offer' },
        h('div', { className: 'shop-item' }, icon(this.assets.url(potion.icon)), h('b', { text: `${offer.potions}× ${potion.name}` })),
        h('div', { className: 'shop-price' }, icon(this.assets.url('moeda')), h('b', { text: String(offer.price) })),
        buy);
    }));
  }

  private buy(offer: Offer): void {
    const { inventory } = this.player;
    if (inventory.count('potion') + offer.potions > ITEMS.potion.maxStack || !this.player.spendCoins(offer.price)) {
      this.sfx.denied();
      return;
    }
    inventory.add('potion', offer.potions);
    this.sfx.buy();
    this.greeting.textContent = offer.potions > 1 ? 'Boa escolha! Volte sempre.' : 'Valeu! Cuidado lá fora.';
    this.refresh();
  }
}
