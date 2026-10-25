import * as THREE from 'three';

/**
 * Pós-processamento do cel shading: renderiza a cena num alvo com profundidade e
 * desenha contornos onde a profundidade quebra (silhuetas, barrancos, sprites).
 * Longe, o contorno engrossa e as cores são posterizadas em poucos tons chapados.
 */
export class CelOutline {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly screen = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly camera: THREE.PerspectiveCamera) {
    this.target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthTexture: new THREE.DepthTexture(1, 1) });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        texel: { value: new THREE.Vector2() },
        near: { value: camera.near },
        far: { value: camera.far },
        ink: { value: new THREE.Color(0x1d2340) },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor, tDepth;
        uniform vec2 texel;
        uniform float near, far;
        uniform vec3 ink;
        varying vec2 vUv;
        float depthAt(vec2 uv) {
          float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
          return 2.0 * near * far / (far + near - z * (far - near));
        }
        void main() {
          vec4 color = texture2D(tColor, vUv);
          float d = depthAt(vUv);
          float far = smoothstep(40.0, 160.0, d);
          vec2 o = texel * (1.0 + far);                     // contorno de 2 px ao longe
          // segunda derivada: plano inclinado dá ~0 mesmo rasante; quina e silhueta não
          float bendX = abs(depthAt(vUv + vec2(o.x, 0.0)) + depthAt(vUv - vec2(o.x, 0.0)) - 2.0 * d);
          float bendY = abs(depthAt(vUv + vec2(0.0, o.y)) + depthAt(vUv - vec2(0.0, o.y)) - 2.0 * d);
          float edge = smoothstep(0.02, 0.05, max(bendX, bendY) / d) * (1.0 - smoothstep(240.0, 330.0, d));
          vec3 srgb = pow(max(color.rgb, 0.0), vec3(1.0 / 2.2));
          vec3 poster = pow(floor(srgb * 6.0 + 0.5) / 6.0, vec3(2.2)); // tons chapados
          vec3 base = mix(color.rgb, poster, far);
          gl_FragColor = vec4(mix(base, ink, edge * mix(0.75, 0.95, far)), 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
  }

  setSize(width: number, height: number): void {
    const ratio = this.renderer.getPixelRatio();
    const w = Math.floor(width * ratio), h = Math.floor(height * ratio);
    this.target.setSize(w, h);
    (this.material.uniforms.texel!.value as THREE.Vector2).set(1 / w, 1 / h);
  }

  render(scene: THREE.Scene): void {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quad, this.screen);
  }
}
