import * as THREE from 'three';
import type { QualityPreset } from '../../core/quality';
import type { WorldTheme } from './WorldTheme';

const particleShader = {
  uniforms: {
    uTime: { value: 0 },
    uReveal: { value: 1 },
    uDisperse: { value: 0 },
    uImpact: { value: 0 },
    uMode: { value: 0 },
    uDensity: { value: 1 },
    uPointer: { value: new THREE.Vector2() },
    uAccent: { value: new THREE.Color(0xffffff) },
    uSecondary: { value: new THREE.Color(0xffffff) },
  },
  vertexShader: `
    uniform float uTime;
    uniform float uReveal;
    uniform float uDisperse;
    uniform float uImpact;
    uniform float uMode;
    uniform float uDensity;
    uniform vec2 uPointer;
    attribute float aSeed;
    attribute float aLayer;
    varying float vAlpha;
    varying float vMix;

    mat2 rotate2d(float angle) {
      float sine = sin(angle);
      float cosine = cos(angle);
      return mat2(cosine, -sine, sine, cosine);
    }

    void main() {
      vec3 base = position;
      float speed = 0.12 + aSeed * 0.22;
      if (uMode < 0.5) {
        base.y += sin(uTime * (0.7 + aSeed) + base.x * 1.7) * 0.34;
        base.yz = rotate2d(uTime * speed * sign(base.x + 0.001)) * base.yz;
        base.x += sin(uTime * 0.42 + aSeed * 18.0) * 0.28;
      } else if (uMode < 1.5) {
        base.xz = rotate2d(uTime * speed + aLayer * 0.7) * base.xz;
        float gather = sin(uTime * 0.9 + aSeed * 31.0) * 0.16;
        base += normalize(base + vec3(0.001)) * gather;
      } else {
        base.xz = rotate2d(uTime * speed * 0.55) * base.xz;
        base.y += sin(uTime * 0.55 + aSeed * 25.0) * 0.22;
      }

      vec3 direction = normalize(base + vec3(0.001));
      vec3 scattered = direction * (8.0 + aLayer * 4.5) + vec3(
        sin(aSeed * 53.0),
        cos(aSeed * 31.0),
        sin(aSeed * 71.0)
      ) * 2.2;
      vec3 animated = mix(scattered, base, smoothstep(0.0, 1.0, uReveal));
      animated += direction * uDisperse * (2.5 + aLayer * 4.0 + uImpact * 1.4);
      float pointerFalloff = exp(-length(animated.xy - uPointer * vec2(5.0, 3.2)) * 0.45);
      animated.xy += uPointer * pointerFalloff * (0.2 + aLayer * 0.26);

      vec4 viewPosition = modelViewMatrix * vec4(animated, 1.0);
      float pulse = 0.72 + sin(uTime * 2.1 + aSeed * 44.0) * 0.28;
      gl_PointSize = (2.0 + aLayer * 3.2 + uImpact * 2.2) * pulse * mix(0.76, 1.0, uDensity)
        * (48.0 / max(2.0, -viewPosition.z));
      gl_Position = projectionMatrix * viewPosition;
      vAlpha = smoothstep(0.0, 0.22, uReveal) * (0.28 + aLayer * 0.62)
        * (1.0 - uDisperse * 0.42) * uDensity;
      vMix = fract(aSeed * 4.17 + aLayer);
    }
  `,
  fragmentShader: `
    uniform vec3 uAccent;
    uniform vec3 uSecondary;
    varying float vAlpha;
    varying float vMix;
    void main() {
      float radius = length(gl_PointCoord - 0.5);
      float core = 1.0 - smoothstep(0.04, 0.48, radius);
      float halo = 1.0 - smoothstep(0.08, 0.5, radius);
      vec3 color = mix(uAccent, uSecondary, smoothstep(0.28, 0.82, vMix));
      gl_FragColor = vec4(color * (0.72 + core * 1.6), halo * vAlpha);
    }
  `,
};

export class EnvironmentParticles {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly material: THREE.ShaderMaterial;
  private impact = 0;

  constructor(preset: QualityPreset) {
    const count = preset === 'low' ? 120 : preset === 'medium' ? 280 : 560;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const layers = new Float32Array(count);
    let state = 0x1f123bb5;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 2.2 + random() * 4.4;
      const layer = random();
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = (random() - 0.48) * (4.2 + layer * 2.8);
      positions[index * 3 + 2] = -1.4 + Math.sin(angle) * radius * 0.66 - layer * 3.8;
      seeds[index] = random();
      layers[index] = layer;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));
    this.material = new THREE.ShaderMaterial({
      ...particleShader,
      uniforms: THREE.UniformsUtils.clone(particleShader.uniforms),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.name = 'Reusable GPU world particles';
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  setTheme(theme: WorldTheme): void {
    this.material.uniforms.uMode.value = theme.particleMode;
    this.material.uniforms.uDensity.value = theme.particleDensity;
    this.material.uniforms.uAccent.value.copy(theme.accent);
    this.material.uniforms.uSecondary.value.copy(theme.secondary);
  }

  impactBurst(strength: number): void {
    this.impact = Math.max(this.impact, THREE.MathUtils.clamp(strength / 2.25, 0.35, 1));
  }

  update(
    delta: number,
    elapsed: number,
    reveal: number,
    disperse: number,
    pointer: THREE.Vector2,
  ): void {
    this.impact = Math.max(0, this.impact - delta * 1.4);
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uReveal.value = reveal;
    this.material.uniforms.uDisperse.value = disperse;
    this.material.uniforms.uImpact.value = this.impact;
    this.material.uniforms.uPointer.value.copy(pointer);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
