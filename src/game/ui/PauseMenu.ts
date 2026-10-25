import { button, h, Modal, tabs } from './components';

const CONTROLS: [string, string][] = [
  ['WASD', 'Andar'], ['Espaço', 'Pular'], ['Clique / F', 'Atacar'], ['T / botão direito', 'Travar/soltar mira'], ['G', 'Trocar espada/maraca'], ['Q', 'Beber poção'],
  ['Shift', 'Dash (com o chapéu)'], ['E', 'Tampa do esgoto'], ['Tab / I', 'Inventário'], ['P / Esc', 'Pausa'], ['M', 'Som'],
];

export interface PauseActions { inventory(): void; toggleMute(): boolean; muted(): boolean }

/** Menu de pausa (P ou Esc): continuar, inventário, som e lista de controles. */
export class PauseMenu extends Modal {
  private readonly muteButton: HTMLButtonElement;

  constructor(private readonly actions: PauseActions) {
    super('Pausa', 'P ou Esc continua · online, o mundo não para', 'sm');
    this.muteButton = button('', { onClick: () => { actions.toggleMute(); this.syncMute(); } });
    const game = h('div', { className: 'ui-stack' },
      button('Continuar', { variant: 'primary', hotkey: 'P', onClick: () => this.toggle(false) }),
      button('Inventário', { hotkey: 'Tab', onClick: () => actions.inventory() }),
      this.muteButton,
      button('Recarregar', { variant: 'danger', onClick: () => location.reload() }));
    const controls = h('dl', { className: 'ui-keys' }, ...CONTROLS.flatMap(([k, v]) => [h('dt', {}, h('kbd', { text: k })), h('dd', { text: v })]));
    this.body.append(tabs([{ label: 'Jogo', content: game }, { label: 'Controles', content: controls }]));
  }

  protected override onOpen(): void { this.syncMute(); }
  private syncMute(): void {
    const label = this.muteButton.querySelector('span');
    if (label) label.textContent = this.actions.muted() ? '🔇 Som desligado' : '🔊 Som ligado';
  }
}
