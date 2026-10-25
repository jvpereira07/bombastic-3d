import * as THREE from 'three';

let gradient: THREE.DataTexture | undefined;

/** Rampa de 3 faixas (sombra, meio-tom, luz) compartilhada por todos os materiais toon. */
function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
  gradient.magFilter = gradient.minFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

/** Material com cel shading: luz em faixas em vez de degradê. */
export const toonMaterial = (params: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial =>
  new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...params });
