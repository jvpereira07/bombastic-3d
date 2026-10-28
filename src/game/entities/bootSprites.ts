import * as THREE from 'three';

/** Cores de uma bota no corpo do jogador: contorno, couro e brilho. */
export interface BootPalette { dark: number; base: number; light: number }

const FRAME = 32;
/** Linhas do fim da silhueta onde ficam os sapatos. */
const FOOT_ROWS = 5;
/** Quanto o cano da bota sobe acima do sapato. */
const SHAFT = 2;

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/**
 * Camada de bota para uma folha do jogador: em cada quadro acha os sapatos (pixels escuros no fim da
 * silhueta), sobe um cano curto por cima da calça e pinta tudo com a paleta, mantendo o sombreado do
 * original. Fora da bota fica transparente, para desenhar por cima do corpo.
 */
export function bootCanvas(body: CanvasImageSource & { width: number; height: number }, palette: BootPalette): HTMLCanvasElement {
  const { width, height } = body;
  const src = document.createElement('canvas');
  src.width = width; src.height = height;
  const sg = src.getContext('2d', { willReadFrequently: true })!;
  sg.drawImage(body, 0, 0);
  const pixels = sg.getImageData(0, 0, width, height).data;
  const out = new ImageData(width, height);
  const [dark, base, light] = [rgb(palette.dark), rgb(palette.base), rgb(palette.light)];
  const at = (x: number, y: number): number => (y * width + x) * 4;
  const lum = (i: number): number => (pixels[i]! + pixels[i + 1]! + pixels[i + 2]!) / 3;
  const opaque = (x: number, y: number): boolean => pixels[at(x, y) + 3]! >= 128;

  for (let fy = 0; fy < height; fy += FRAME) for (let fx = 0; fx < width; fx += FRAME) {
    let bottom = -1;
    for (let y = fy + FRAME - 1; y >= fy && bottom < 0; y--) for (let x = fx; x < fx + FRAME; x++) if (opaque(x, y)) { bottom = y; break; }
    if (bottom < 0) continue;
    const boot = new Set<number>();
    for (let y = Math.max(fy, bottom - FOOT_ROWS + 1); y <= bottom; y++) for (let x = fx; x < fx + FRAME; x++) {
      if (opaque(x, y) && lum(at(x, y)) < 60) boot.add(y * width + x);
    }
    // cano: o que estiver logo acima do sapato vira bota também
    for (const p of [...boot]) {
      const x = p % width, y = Math.floor(p / width);
      for (let k = 1; k <= SHAFT && y - k >= fy; k++) if (opaque(x, y - k)) boot.add((y - k) * width + x);
    }
    for (const p of boot) {
      const x = p % width, y = Math.floor(p / width), i = at(x, y);
      const edge = [[1, 0], [-1, 0], [0, 1]].some(([dx, dy]) => { const q = (y + dy!) * width + x + dx!; return !boot.has(q); });
      const c = edge ? dark : lum(i) > 120 ? light : base;
      out.data.set([c[0], c[1], c[2], 255], i);
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d')!.putImageData(out, 0, 0);
  return canvas;
}

export function bootTexture(body: CanvasImageSource & { width: number; height: number }, palette: BootPalette): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(bootCanvas(body, palette));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  return tex;
}
