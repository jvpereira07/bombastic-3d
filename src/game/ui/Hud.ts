import type { Assets } from '../../engine/Assets';
import type { Weapon } from '../entities/Player';
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
  potions: number; hasHat: boolean; hasMaraca: boolean; weapon: Weapon;
  boss: { visible: boolean; hp: number; maxHp: number };
  showManholePrompt: boolean;
}

/** Interface em HTML sobre o canvas, com as imagens do projeto. */
export class Hud {
  private readonly hpFill = $('#hpBar i');
  private readonly hpText = $('#hpTxt');
  private readonly stFill = $('#stBar i');
  private readonly potionCount = $('#potN');
  private readonly potionSlot = $('#potSlot');
  private readonly hatSlot = $('#hatSlot');
  private readonly weaponSlot = $('#weaponSlot');
  private readonly weaponImg = $<HTMLImageElement>('#weaponImg');
  private readonly weaponIcons: Record<Weapon, string>;
  private readonly bossPanel = $('#boss');
  private readonly bossFill = $('#boss i');
  private readonly banner = $('#banner');
  private readonly prompt = $('#prompt');
  private readonly hint = $('#hint');
  private readonly online = $('#online');
  private readonly muteButton = $<HTMLButtonElement>('#mute');
  private bannerTimer = 0;

  constructor(assets: Assets) {
    $('#hpBar').style.backgroundImage = `url(${assets.url('ui_hp_empty')})`;
    this.hpFill.style.backgroundImage = `url(${assets.url('ui_hp_full')})`;
    $('#stBar').style.backgroundImage = `url(${assets.url('ui_st_empty')})`;
    this.stFill.style.backgroundImage = `url(${assets.url('ui_st_full')})`;
    for (const slot of document.querySelectorAll<HTMLElement>('.slot')) slot.style.backgroundImage = `url(${assets.url('ui_slot')})`;
    $<HTMLImageElement>('#potImg').src = assets.url(ITEMS.potion.icon);
    $<HTMLImageElement>('#hatImg').src = assets.url(ITEMS.sombrero.icon);
    this.weaponIcons = { sword: assets.url('sword'), maraca: assets.url(ITEMS.maraca.icon) };
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
    this.hpText.textContent = String(Math.ceil(s.hp));
    this.potionCount.textContent = String(s.potions);
    this.potionSlot.classList.toggle('off', s.potions === 0);
    this.hatSlot.classList.toggle('off', !s.hasHat);
    this.weaponSlot.classList.toggle('off', !s.hasMaraca); // sem maraca não há o que trocar
    if (!this.weaponImg.src.endsWith(this.weaponIcons[s.weapon])) this.weaponImg.src = this.weaponIcons[s.weapon];
    this.bossPanel.hidden = !s.boss.visible;
    this.bossFill.style.width = `${(s.boss.hp / s.boss.maxHp) * 100}%`;
    this.prompt.hidden = !s.showManholePrompt;
  }

  /** Recorta a imagem "cheia" mantendo a "vazia" por baixo (o ícone da ponta continua visível). */
  private static fill(el: HTMLElement, [start, end, width]: readonly [number, number, number], ratio: number): void {
    const pct = ((start + (end - start) * Math.max(0, Math.min(1, ratio))) / width) * 100;
    el.style.width = `${pct}%`;
    el.style.backgroundSize = `${(100 / pct) * 100}% 100%`;
  }
}
