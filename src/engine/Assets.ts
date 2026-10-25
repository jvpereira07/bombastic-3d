import * as THREE from 'three';

/** Carrega todas as imagens antes do jogo começar, para que clones de textura já tenham a imagem. */
export class Assets {
  private readonly textures = new Map<string, THREE.Texture>();

  constructor(private readonly urls: Readonly<Record<string, string>>) {}

  async loadAll(): Promise<void> {
    const loader = new THREE.TextureLoader();
    await Promise.all(Object.entries(this.urls).map(async ([name, url]) => {
      const tex = await loader.loadAsync(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(name, tex);
    }));
  }

  url(name: string): string {
    const url = this.urls[name];
    if (!url) throw new Error(`Imagem desconhecida: ${name}`);
    return url;
  }

  /** Textura própria (clone): pode ter offset/repeat independentes. */
  texture(name: string): THREE.Texture {
    const base = this.textures.get(name);
    if (!base) throw new Error(`Imagem não carregada: ${name}`);
    const tex = base.clone();
    tex.needsUpdate = true;
    return tex;
  }

  /** Textura de pixel art nítida (sem filtro). */
  pixel(name: string): THREE.Texture {
    const tex = this.texture(name);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  /** Tile repetido: nítido de perto, com mipmap de longe para não cintilar. */
  tile(name: string, repeatX: number, repeatY: number, anisotropy: number): THREE.Texture {
    const tex = this.texture(name);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = anisotropy;
    return tex;
  }
}
