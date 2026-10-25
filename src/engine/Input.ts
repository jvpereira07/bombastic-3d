type KeyHandler = (code: string) => void;
type LookHandler = (dx: number, dy: number) => void;

/** Teclado, mouse travado (pointer lock), arrastar e roda do mouse. */
export class Input {
  private readonly down = new Set<string>();
  private readonly keyHandlers = new Map<string, KeyHandler[]>();
  private readonly lookHandlers: LookHandler[] = [];
  private readonly zoomHandlers: ((delta: number) => void)[] = [];
  private readonly lockedClickHandlers: (() => void)[] = [];
  private readonly lockChangeHandlers: ((locked: boolean) => void)[] = [];
  private drag: { x: number; y: number } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      if (!e.repeat) for (const h of this.keyHandlers.get(e.code) ?? []) h(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());

    canvas.addEventListener('click', () => {
      if (this.locked) { for (const h of this.lockedClickHandlers) h(); return; }
      try { void canvas.requestPointerLock()?.catch?.(() => undefined); } catch { /* sem pointer lock: arrastar continua valendo */ }
    });
    document.addEventListener('pointerlockchange', () => { for (const h of this.lockChangeHandlers) h(this.locked); });
    addEventListener('mousemove', (e) => { if (this.locked) this.emitLook(e.movementX, e.movementY); });
    canvas.addEventListener('pointerdown', (e) => { if (!this.locked) this.drag = { x: e.clientX, y: e.clientY }; });
    addEventListener('pointerup', () => { this.drag = null; });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag || this.locked) return;
      this.emitLook((e.clientX - this.drag.x) * 2, (e.clientY - this.drag.y) * 2);
      this.drag = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); for (const h of this.zoomHandlers) h(e.deltaY); }, { passive: false });
  }

  get locked(): boolean { return document.pointerLockElement === this.canvas; }

  isDown(...codes: string[]): boolean { return codes.some((c) => this.down.has(c)); }

  /** -1..1 em cada eixo (x: direita, z: para trás). */
  axis(): { x: number; z: number } {
    return {
      x: (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0),
      z: (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0),
    };
  }

  onKey(codes: string[], handler: KeyHandler): void {
    for (const c of codes) this.keyHandlers.set(c, [...(this.keyHandlers.get(c) ?? []), handler]);
  }
  onLook(h: LookHandler): void { this.lookHandlers.push(h); }
  onZoom(h: (delta: number) => void): void { this.zoomHandlers.push(h); }
  onLockedClick(h: () => void): void { this.lockedClickHandlers.push(h); }
  onLockChange(h: (locked: boolean) => void): void { this.lockChangeHandlers.push(h); }

  private emitLook(dx: number, dy: number): void { for (const h of this.lookHandlers) h(dx, dy); }
}
