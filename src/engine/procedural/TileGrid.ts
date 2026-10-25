/** Tipos de célula de uma masmorra em grade. Void = rocha (não anda, vira parede na borda). */
export const Tile = { Void: 0, Floor: 1, Water: 2, Bridge: 3 } as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export const isWalkable = (t: Tile): boolean => t !== Tile.Void;

/** Grade de células com coordenadas inteiras; fora dos limites é Void. */
export class TileGrid {
  private readonly cells: Uint8Array;

  constructor(readonly width: number, readonly height: number) {
    this.cells = new Uint8Array(width * height);
  }

  inside(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.width && y < this.height; }

  get(x: number, y: number): Tile { return this.inside(x, y) ? (this.cells[y * this.width + x]! as Tile) : Tile.Void; }

  set(x: number, y: number, t: Tile): void { if (this.inside(x, y)) this.cells[y * this.width + x] = t; }

  /** Só escreve onde ainda é Void (corredor não apaga sala). */
  carve(x: number, y: number, t: Tile): void { if (this.get(x, y) === Tile.Void) this.set(x, y, t); }

  forEach(fn: (x: number, y: number, t: Tile) => void): void {
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) fn(x, y, this.get(x, y));
  }
}
