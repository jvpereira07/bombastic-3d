type KeyHandler = (code: string) => void;
interface KeyBinding { handler: KeyHandler; always: boolean }
type LookHandler = (dx: number, dy: number) => void;

/** Teclado, mouse travado (pointer lock), arrastar e roda do mouse. */
export class Input {
  private readonly down = new Set<string>();
  private readonly keyHandlers = new Map<string, KeyBinding[]>();
  private readonly lookHandlers: LookHandler[] = [];
  private readonly zoomHandlers: ((delta: number) => void)[] = [];
  private readonly lockedClickHandlers: (() => void)[] = [];
  private readonly altClickHandlers: (() => void)[] = [];
  private readonly lockChangeHandlers: ((locked: boolean) => void)[] = [];
  private drag: { x: number; y: number } | null = null;
  /** Botão esquerdo pressionado com o mouse travado (segurar ataque). */
  private mouseHeld = false;
  /** Quando devolve true (ex.: menu aberto), o jogo não recebe teclas, cliques nem movimento. */
  blocked: () => boolean = () => false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Tab' || e.code === 'F3') e.preventDefault(); // F3 = depuração, não a busca do navegador
      if (e.repeat) return void this.down.add(e.code);
      const blocked = this.blocked();
      for (const b of this.keyHandlers.get(e.code) ?? []) if (b.always || !blocked) b.handler(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); this.mouseHeld = false; });

    // com o mouse travado o ataque sai ao apertar (não ao soltar), para dar para segurar
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.locked || this.blocked()) return;
      this.mouseHeld = true;
      for (const h of this.lockedClickHandlers) h();
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseHeld = false; });
    canvas.addEventListener('click', () => {
      if (this.blocked() || this.locked) return;
      try { void canvas.requestPointerLock()?.catch?.(() => undefined); } catch { /* sem pointer lock: arrastar continua valendo */ }
    });
    document.addEventListener('pointerlockchange', () => { for (const h of this.lockChangeHandlers) h(this.locked); });
    addEventListener('mousemove', (e) => { if (this.locked) this.emitLook(e.movementX, e.movementY); });
    canvas.addEventListener('pointerdown', (e) => { if (!this.locked && !this.blocked()) this.drag = { x: e.clientX, y: e.clientY }; });
    addEventListener('pointerup', () => { this.drag = null; });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag || this.locked) return;
      this.emitLook((e.clientX - this.drag.x) * 2, (e.clientY - this.drag.y) * 2);
      this.drag = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => { if (e.button === 2 && !this.blocked()) for (const h of this.altClickHandlers) h(); });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); for (const h of this.zoomHandlers) h(e.deltaY); }, { passive: false });
  }

  /** Ataque sendo segurado: botão esquerdo (travado) ou F/J. */
  primaryHeld(): boolean { return !this.blocked() && (this.mouseHeld || this.isDown('KeyF', 'KeyJ')); }

  get locked(): boolean { return document.pointerLockElement === this.canvas; }

  isDown(...codes: string[]): boolean { return codes.some((c) => this.down.has(c)); }

  /** -1..1 em cada eixo (x: direita, z: para trás). */
  axis(): { x: number; z: number } {
    if (this.blocked()) return { x: 0, z: 0 };
    return {
      x: (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0),
      z: (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0),
    };
  }

  /** `always`: dispara mesmo com a entrada bloqueada (atalhos de menus). */
  onKey(codes: string[], handler: KeyHandler, always = false): void {
    for (const c of codes) this.keyHandlers.set(c, [...(this.keyHandlers.get(c) ?? []), { handler, always }]);
  }
  onLook(h: LookHandler): void { this.lookHandlers.push(h); }
  onZoom(h: (delta: number) => void): void { this.zoomHandlers.push(h); }
  onLockedClick(h: () => void): void { this.lockedClickHandlers.push(h); }
  /** Botão direito do mouse. */
  onAltClick(h: () => void): void { this.altClickHandlers.push(h); }
  onLockChange(h: (locked: boolean) => void): void { this.lockChangeHandlers.push(h); }

  private emitLook(dx: number, dy: number): void { for (const h of this.lookHandlers) h(dx, dy); }
}
