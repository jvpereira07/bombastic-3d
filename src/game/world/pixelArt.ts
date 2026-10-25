import * as THREE from 'three';

export type Grid = (string | null)[][];
export type Palette = Record<string, string>;

export function gridTexture(grid: Grid, palette: Palette): THREE.CanvasTexture {
  const h = grid.length, w = grid[0]?.length ?? 0;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponível');
  grid.forEach((row, y) => row.forEach((ch, x) => {
    const color = ch ? palette[ch] : undefined;
    if (color) { g.fillStyle = color; g.fillRect(x, y, 1, 1); }
  }));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/** Contorna com `ch` todo pixel vazio vizinho de um pixel opaco. */
export function outline(grid: Grid, ch = 'o'): Grid {
  const out = grid.map((r) => r.slice());
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell) return;
    const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx = 0, dy = 0]) => {
      const n = grid[y + dy]?.[x + dx];
      return n && n !== ch;
    });
    if (touches) out[y]![x] = ch;
  }));
  return out;
}

interface Trunk { x: number; y: number; w: number }

/** Copa feita de círculos com luz vinda de cima-esquerda, pontilhado e contorno. */
export function blobGrid(w: number, h: number, circles: [number, number, number][], trunk?: Trunk): Grid {
  const g: Grid = Array.from({ length: h }, () => Array<string | null>(w).fill(null));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let inside = false, light = -1;
    for (const [cx, cy, r] of circles) {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      if (d <= r) { inside = true; light = Math.max(light, ((-dx - dy) / r) * 0.6 + (1 - d / r) * 0.4); }
    }
    if (inside) {
      const v = light + (Math.random() - 0.5) * 0.25 + ((x + y) % 2 ? 0.05 : 0);
      g[y]![x] = v > 0.55 ? 'L' : v > 0.2 ? 'M' : v > -0.2 ? 'D' : 'K';
    }
  }
  if (trunk) for (let y = trunk.y; y < h; y++) for (let x = trunk.x; x < trunk.x + trunk.w; x++) {
    if (!g[y]![x] || y > trunk.y + 2) g[y]![x] = x === trunk.x ? 't' : 'T';
  }
  return outline(g);
}

const leafPalette = (L: string, M: string, D: string, K: string): Palette =>
  ({ L, M, D, K, t: '#9a6a3c', T: '#6b4226', o: '#1f2a1a' });

export const ProceduralSprites = {
  tree: () => gridTexture(blobGrid(32, 40, [[16, 13, 10], [9, 18, 7], [23, 18, 7], [16, 22, 7]], { x: 14, y: 26, w: 4 }),
    leafPalette('#9be36a', '#5cbf45', '#3a9137', '#25652e')),
  pinkTree: () => gridTexture(blobGrid(28, 34, [[14, 11, 9], [8, 15, 6], [20, 15, 6]], { x: 12, y: 21, w: 4 }),
    leafPalette('#ffe1ef', '#f7a8cc', '#de78a8', '#a84f7f')),
  bush: () => gridTexture(blobGrid(18, 12, [[6, 7, 5], [12, 7, 5], [9, 5, 4]]), leafPalette('#8fdc62', '#56b843', '#368a35', '#22602c')),
  flower: (color: string) => gridTexture(outline([[null, 'y', null], ['y', 'c', 'y'], [null, 'y', null], [null, 'g', null], ['g', 'g', null]]),
    { y: color, c: '#fff3a0', g: '#3a8f2a', o: '#1f2a1a' }),
  tuft: () => gridTexture(outline([
    [null, null, 'L', null, null, null, 'L', null], [null, 'L', 'M', null, 'L', null, 'M', null], ['L', 'M', 'M', null, 'M', 'L', 'M', null],
    [null, 'M', 'D', 'M', 'M', 'M', 'D', 'L'], [null, 'D', 'D', 'M', 'D', 'M', 'D', 'M'], ['D', 'D', 'K', 'D', 'D', 'D', 'K', 'D']]),
    { L: '#a8ec74', M: '#5cbf45', D: '#3a9137', K: '#25652e', o: '#1f4a1f' }),
  /** Detalhe de grama em tons de cinza; a cor vem das cores por vértice do terreno. */
  grassDetail(): THREE.CanvasTexture {
    const N = 64, canvas = document.createElement('canvas');
    canvas.width = canvas.height = N;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Canvas 2D indisponível');
    const tones = ['#ffffff', '#f2f2f2', '#e8e8e8', '#f8f8f8'];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { g.fillStyle = tones[(Math.random() * tones.length) | 0]!; g.fillRect(x, y, 1, 1); }
    for (let i = 0; i < 220; i++) {
      const x = (Math.random() * N) | 0, y = (Math.random() * N) | 0, h = 2 + ((Math.random() * 3) | 0);
      for (let k = 0; k < h; k++) { g.fillStyle = k === 0 ? '#ffffff' : k === h - 1 ? '#a8a8a8' : '#cfcfcf'; g.fillRect(x, (y + k) % N, 1, 1); }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  },
};

/** Grade vazia w x h para desenhar à mão. */
const blank = (w: number, h: number): Grid => Array.from({ length: h }, () => Array<string | null>(w).fill(null));

/** Cacto saguaro: tronco com dois braços, listras verticais. */
function cactusGrid(): Grid {
  const g = blank(16, 26);
  const fill = (x0: number, y0: number, x1: number, y1: number): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y]![x] = x === x0 ? 'L' : x === x1 ? 'D' : (x - x0) % 2 ? 'M' : 'L';
  };
  fill(6, 1, 9, 25);
  fill(1, 8, 4, 16); fill(1, 15, 6, 17);
  fill(11, 5, 14, 13); fill(9, 12, 14, 14);
  return outline(g);
}

/** Pinheiro com neve: camadas triangulares, neve no topo de cada uma. */
function pineGrid(): Grid {
  const g = blank(24, 36);
  for (const [top, half, h] of [[1, 5, 9], [7, 8, 10], [14, 11, 11]] as const) {
    for (let y = 0; y < h; y++) {
      const w = Math.round(1 + (half * y) / (h - 1));
      for (let x = 12 - w; x <= 12 + w; x++) g[top + y]![x] = y < 2 + (x % 3 === 0 ? 1 : 0) ? 'S' : x < 12 ? 'M' : 'D';
    }
  }
  for (let y = 25; y < 36; y++) for (let x = 11; x <= 13; x++) g[y]![x] = x === 11 ? 't' : 'T';
  return outline(g);
}

/** Coqueiro: tronco curvo e folhas em leque. */
function palmGrid(): Grid {
  const g = blank(30, 40);
  for (let y = 12; y < 40; y++) { const x = 14 + Math.round(Math.sin((y - 12) / 9) * 2); g[y]![x] = (y % 3) ? 't' : 'T'; g[y]![x + 1] = 'T'; }
  for (const [dx, dy] of [[-1, 0.15], [1, 0.15], [-1, 0.6], [1, 0.6], [-0.5, -0.4], [0.5, -0.4]] as const) {
    for (let i = 0; i < 12; i++) {
      const x = Math.round(15 + dx * i), y = Math.round(11 + dy * i + (i * i) / 30);
      for (const o of [0, 1]) if (g[y + o]?.[x] !== undefined) g[y + o]![x] = o ? 'D' : 'L';
    }
  }
  g[12]![14] = 'c'; g[13]![16] = 'c';
  return outline(g);
}

/** Pedra arredondada (serve para deserto, praia e gelo trocando a paleta). */
const rockGrid = (): Grid => blobGrid(14, 10, [[5, 6, 4], [9, 6, 4], [7, 4, 3]]);

export const BiomeSprites = {
  cactus: () => gridTexture(cactusGrid(), { L: '#8fd46a', M: '#5fae48', D: '#3e7f34', o: '#1f3a1a' }),
  pine: () => gridTexture(pineGrid(), { S: '#f4fbff', M: '#3f8a5c', D: '#2a6644', t: '#8a5a34', T: '#5e3b22', o: '#16302a' }),
  palm: () => gridTexture(palmGrid(), { L: '#7ed65a', D: '#3e9a3c', c: '#7a4a24', t: '#c9975c', T: '#9a6c3c', o: '#22301a' }),
  sandRock: () => gridTexture(rockGrid(), { L: '#e9c98f', M: '#c9a26a', D: '#9c7a4a', K: '#6e5434', o: '#3a2a1a' }),
  iceRock: () => gridTexture(rockGrid(), { L: '#ffffff', M: '#cfe9fb', D: '#93c2e6', K: '#5f93c2', o: '#2a4a6a' }),
  deadBush: () => gridTexture(blobGrid(16, 10, [[5, 6, 4], [11, 6, 4]]), { L: '#c8a874', M: '#a5844e', D: '#7d6036', K: '#5a4224', o: '#3a2a16' }),
};
