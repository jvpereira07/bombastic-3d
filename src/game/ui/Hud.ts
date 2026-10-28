import type { Assets } from '../../engine/Assets';
import type { Weapon } from '../items/items';
import { ITEMS } from '../items/items';

/** Limites do preenchimento nas imagens das barras: início, fim e largura total (px). */
const HP_FILL = [4, 160, 185] as const;
const STAMINA_FILL = [4, 158, 183] as const;

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Elemento ausente: ${sel}`);
  return el;
};

export interface HudState {
  hp: number; maxHp: number; stamina: number; maxStamina: number;
  potions: number; hasHat: boolean;
  hands: readonly (Weapon | null)[]; activeHand: number;
  boss: { visible: boolean; hp: number; maxHp: number };
  /** Ação do E disponível agora (vendedor, tampa do esgoto) ou null. */
  prompt: string | null;
  coins: number;
  /** Etapa do combo (0 a 2) ou -1 fora de combo. */
  comboStage: number;
  /** Asas de Ícaro: fração de voo restante e se está planando; null sem asas. */
  flight: { ratio: number; gliding: boolean; airborne: boolean } | null;
}

/** Interface em HTML sobre o canvas, com as imagens do projeto. */
export class Hud {
  private readonly hpFill = $('#hpBar i');
  private readonly hpText = $('#hpTxt');
  private readonly stFill = $('#stBar i');
  private readonly flyBar = $('#flyBar');
  private readonly flyFill = $('#flyBar i');
  private readonly flyLabel = $('#flyBar b');
  private readonly potionCount = $('#potN');
  private readonly potionSlot = $('#potSlot');
  private readonly hatSlot = $('#hatSlot');
  private readonly handSlots = [$('#hand0'), $('#hand1')];
  private readonly weaponIcons: Record<Weapon, string>;
  private readonly bossPanel = $('#boss');
  private readonly bossFill = $('#boss i');
  private readonly banner = $('#banner');
  private readonly prompt = $('#prompt');
  private readonly coins = $('#coinN');
  private readonly hint = $('#hint');
  private readonly online = $('#online');
  private readonly combo = $('#combo');
  private readonly comboPips = [...this.combo.querySelectorAll('i')];
  private lastCombo = -1;
  private readonly muteButton = $<HTMLButtonElement>('#mute');
  private bannerTimer = 0;

  constructor(assets: Assets) {
    $('#hpBar').style.backgroundImage = `url(${assets.url('ui_hp_empty')})`;
    this.hpFill.style.backgroundImage = `url(${assets.url('ui_hp_full')})`;
    $('#stBar').style.backgroundImage = `url(${assets.url('ui_st_empty')})`;
    this.stFill.style.backgroundImage = `url(${assets.url('ui_st_full')})`;
    $<HTMLImageElement>('#potImg').src = assets.url(ITEMS.potion.icon);
    $<HTMLImageElement>('#coinImg').src = assets.url('moeda');
    $<HTMLImageElement>('#hatImg').src = assets.url(ITEMS.sombrero.icon);
    this.weaponIcons = { sword: assets.url(ITEMS.sword.icon), maraca: assets.url(ITEMS.maraca.icon), bow: assets.url(ITEMS.bow.icon) };
  }

  onMuteClick(handler: () => void): void {
    this.muteButton.addEventListener('click', (e) => { e.stopPropagation(); handler(); });
  }
  setMuted(muted: boolean): void { this.muteButton.textContent = muted ? '🔇 Som (M)' : '🔊 Som (M)'; }
  /** Selo do modo online: nome do jogador, ou some quando offline. */
  setOnline(name: string | null): void {
    this.online.hidden = name === null;
    if (name !== null) this.online.textContent = `● Online · ${name}`;
  }
  setHintVisible(visible: boolean): void { this.hint.hidden = !visible; }

  showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.hidden = false;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => { this.banner.hidden = true; }, 4000);
  }

  render(s: HudState): void {
    Hud.fill(this.hpFill, HP_FILL, s.hp / s.maxHp);
    Hud.fill(this.stFill, STAMINA_FILL, s.stamina / s.maxStamina);
    // barra de voo: só com as asas, e quando está no ar ou ainda recarregando
    const f = s.flight;
    this.flyBar.hidden = !f || (!f.airborne && f.ratio >= 1);
    if (f) {
      this.flyFill.style.width = `${f.ratio * 100}%`;
      this.flyBar.classList.toggle('gliding', f.gliding);
      this.flyLabel.textContent = f.gliding ? 'Planando' : `Voo ${Math.ceil(f.ratio * 10)}s`;
    }
    this.hpText.textContent = String(Math.ceil(s.hp));
    this.potionCount.textContent = String(s.potions);
    this.potionSlot.classList.toggle('off', s.potions === 0);
    this.hatSlot.classList.toggle('off', !s.hasHat);
    this.handSlots.forEach((slot, i) => {
      const weapon = s.hands[i], img = slot.querySelector('img');
      slot.classList.toggle('off', !weapon);
      slot.classList.toggle('active', !!weapon && i === s.activeHand);
      if (img) { img.hidden = !weapon; if (weapon && !img.src.endsWith(this.weaponIcons[weapon])) img.src = this.weaponIcons[weapon]; }
    });
    this.bossPanel.hidden = !s.boss.visible;
    this.bossFill.style.width = `${(s.boss.hp / s.boss.maxHp) * 100}%`;
    this.prompt.hidden = !s.prompt;
    if (s.prompt && this.prompt.textContent !== s.prompt) this.prompt.textContent = s.prompt;
    if (this.coins.textContent !== String(s.coins)) this.coins.textContent = String(s.coins);
    if (s.comboStage !== this.lastCombo) {
      this.lastCombo = s.comboStage;
      this.combo.hidden = s.comboStage < 0;
      this.combo.classList.toggle('finisher', s.comboStage === 2);
      this.comboPips.forEach((pip, i) => pip.classList.toggle('on', i <= s.comboStage));
      // reinicia o "pulo" a cada golpe emendado
      this.combo.classList.remove('bump'); void this.combo.offsetWidth; this.combo.classList.add('bump');
    }
  }

  /** Recorta a imagem "cheia" mantendo a "vazia" por baixo (o ícone da ponta continua visível). */
  private static fill(el: HTMLElement, [start, end, width]: readonly [number, number, number], ratio: number): void {
    const pct = ((start + (end - start) * Math.max(0, Math.min(1, ratio))) / width) * 100;
    el.style.width = `${pct}%`;
    el.style.backgroundSize = `${(100 / pct) * 100}% 100%`;
  }
}
