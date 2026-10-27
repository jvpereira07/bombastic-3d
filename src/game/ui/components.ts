/** Componentes de interface em DOM puro, no estilo cartoon (contorno grosso + sombra sólida). */

type Child = Node | string | null | undefined | false;
interface Props { className?: string; text?: string; attrs?: Record<string, string> }

/** Cria um elemento com classe, texto, atributos e filhos. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.className) el.className = props.className;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

/** Quadro de uma folha de sprites: [colunas, linhas, coluna, linha]. */
export type Frame = readonly [number, number, number, number];

/** Ícone recortado de uma imagem (inteira ou um quadro de folha de sprites). */
export function icon(url: string, frame: Frame = [1, 1, 0, 0]): HTMLSpanElement {
  const el = h('span', { className: 'ui-icon', attrs: { 'aria-hidden': 'true' } });
  const [cols, rows, col, row] = frame;
  el.style.backgroundImage = `url(${url})`;
  el.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
  el.style.backgroundPosition = `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`;
  return el;
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
interface ButtonOptions { variant?: ButtonVariant; icon?: HTMLElement; hotkey?: string; onClick?: () => void; className?: string }

export function button(label: string, opts: ButtonOptions = {}): HTMLButtonElement {
  const el = h('button', { className: `ui-btn ${opts.variant ?? 'secondary'} ${opts.className ?? ''}`.trim(), attrs: { type: 'button' } },
    opts.icon, h('span', { text: label }), opts.hotkey ? h('kbd', { text: opts.hotkey }) : null);
  if (opts.onClick) el.addEventListener('click', opts.onClick);
  return el;
}

export function badge(text: string, tone: 'gold' | 'blue' | 'green' | 'red' = 'gold'): HTMLSpanElement {
  return h('span', { className: `ui-badge ${tone}`, text });
}

/** Abas: cada uma troca o conteúdo visível. */
export function tabs(items: { label: string; content: HTMLElement }[]): HTMLElement {
  const bar = h('div', { className: 'ui-tabs', attrs: { role: 'tablist' } });
  const body = h('div', { className: 'ui-tab-body' });
  const buttons = items.map((item) => h('button', { text: item.label, attrs: { type: 'button', role: 'tab' } }));
  const select = (i: number): void => {
    buttons.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
    body.replaceChildren(items[i]?.content ?? '');
  };
  buttons.forEach((b, i) => b.addEventListener('click', () => select(i)));
  bar.append(...buttons);
  select(0);
  return h('div', { className: 'ui-tabs-wrap' }, bar, body);
}

/** Slot de item: ícone, quantidade, tecla de atalho e estado selecionado/vazio. */
export class Slot {
  readonly el = h('button', { className: 'ui-slot empty', attrs: { type: 'button' } });
  private readonly count = h('span', { className: 'n' });
  private iconEl: HTMLElement | null = null;

  constructor(hotkey?: string) {
    if (hotkey) this.el.append(h('kbd', { text: hotkey }));
    this.el.append(this.count);
  }

  set(content: { url: string; label: string; count?: number } | null): void {
    this.iconEl?.remove();
    this.iconEl = null;
    this.el.classList.toggle('empty', !content);
    this.el.setAttribute('aria-label', content?.label ?? 'Vazio');
    this.el.title = content?.label ?? '';
    this.count.textContent = content?.count && content.count > 1 ? String(content.count) : '';
    if (content) { this.iconEl = icon(content.url); this.el.prepend(this.iconEl); }
  }

  set selected(v: boolean) { this.el.classList.toggle('selected', v); }
  set disabled(v: boolean) { this.el.classList.toggle('off', v); }
}

/**
 * Janela modal. Só uma fica aberta por vez; abrir uma solta o mouse travado.
 * Subclasses montam o conteúdo em `body` e podem reagir em `onOpen`.
 */
export class Modal {
  private static current: Modal | null = null;
  private static readonly listeners: ((open: boolean) => void)[] = [];

  static get anyOpen(): boolean { return Modal.current !== null; }
  static closeAll(): void { Modal.current?.toggle(false); }
  static onChange(listener: (open: boolean) => void): void { Modal.listeners.push(listener); }

  protected readonly root = h('div', { className: 'ui-overlay' });
  protected readonly panel = h('section', { className: 'ui-panel', attrs: { role: 'dialog', 'aria-modal': 'true' } });
  protected readonly body = h('div', { className: 'ui-body' });

  constructor(title: string, subtitle = '', size: 'sm' | 'md' | 'lg' | 'xl' = 'md') {
    this.panel.classList.add(size);
    const close = h('button', { className: 'ui-close', text: '✕', attrs: { type: 'button', 'aria-label': 'Fechar' } });
    close.addEventListener('click', () => this.toggle(false));
    this.panel.append(h('header', { className: 'ui-header' }, h('div', {}, h('h2', { text: title }), subtitle ? h('p', { text: subtitle }) : null), close), this.body);
    this.panel.setAttribute('aria-label', title);
    this.root.append(this.panel);
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.toggle(false); });
    document.body.append(this.root);
  }

  get open(): boolean { return !this.root.hidden; }

  toggle(open = !this.open): void {
    if (open === this.open) return;
    if (open && Modal.current && Modal.current !== this) Modal.current.toggle(false);
    this.root.hidden = !open;
    Modal.current = open ? this : null;
    if (open) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.onOpen();
    }
    for (const l of Modal.listeners) l(Modal.anyOpen);
  }

  protected onOpen(): void { /* opcional */ }
}
