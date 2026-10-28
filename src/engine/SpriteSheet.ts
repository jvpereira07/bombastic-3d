import * as THREE from 'three';

/** Fração de texel recolhida em cada borda do quadro: sem isso o vizinho vaza como uma linha. */
const INSET = 0.25;

/** Folha de sprites em grade; cada instância tem sua própria textura para animar sozinha. */
export class SpriteSheet {
  private readonly insetU: number;
  private readonly insetV: number;

  constructor(readonly texture: THREE.Texture, readonly cols: number, readonly rows: number) {
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    const image = texture.image as { width?: number; height?: number } | null;
    this.insetU = image?.width ? INSET / image.width : 0;
    this.insetV = image?.height ? INSET / image.height : 0;
    texture.repeat.set(1 / cols - 2 * this.insetU, 1 / rows - 2 * this.insetV);
    texture.offset.set(this.insetU, this.insetV);
  }

  setFrame(row: number, col: number, flipX = false): void {
    const w = 1 / this.cols - 2 * this.insetU;
    this.texture.repeat.x = flipX ? -w : w;
    this.texture.offset.set((col + (flipX ? 1 : 0)) / this.cols + (flipX ? -this.insetU : this.insetU), 1 - (row + 1) / this.rows + this.insetV);
  }

  /** Avança uma animação de `frames` quadros pelo progresso 0..1. */
  setProgress(row: number, progress: number, frames: number, firstCol = 0): void {
    this.setFrame(row, firstCol + Math.min(frames - 1, Math.floor(progress * frames)));
  }

  dispose(): void {
    this.texture.dispose();
  }
}
