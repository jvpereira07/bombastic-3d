import * as THREE from 'three';

/** Folha de sprites em grade; cada instância tem sua própria textura para animar sozinha. */
export class SpriteSheet {
  constructor(readonly texture: THREE.Texture, readonly cols: number, readonly rows: number) {
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.set(1 / cols, 1 / rows);
  }

  setFrame(row: number, col: number, flipX = false): void {
    this.texture.repeat.x = (flipX ? -1 : 1) / this.cols;
    this.texture.offset.set((col + (flipX ? 1 : 0)) / this.cols, 1 - (row + 1) / this.rows);
  }

  /** Avança uma animação de `frames` quadros pelo progresso 0..1. */
  setProgress(row: number, progress: number, frames: number, firstCol = 0): void {
    this.setFrame(row, firstCol + Math.min(frames - 1, Math.floor(progress * frames)));
  }

  dispose(): void {
    this.texture.dispose();
  }
}
