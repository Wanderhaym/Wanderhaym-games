import * as THREE from 'three';
import type { QualityPreset } from '../core/quality';

const shader = {
  uniforms: {
    uProgress: { value: 2 },
    uTime: { value: 0 },
    uMode: { value: 0 },
    uAccent: { value: new THREE.Color(0xffffff) },
    uSecondary: { value: new THREE.Color(0xffffff) },
  },
  vertexShader: `
    uniform float uProgress;
    uniform float uTime;
    uniform float uMode;
    attribute float aSeed;
    attribute float aLayer;
    varying float vAlpha;
    varying float vMix;

    mat2 rot(float a) { float s = sin(a); float c = cos(a); return mat2(c,-s,s,c); }

    void main() {
      float seed = aSeed;
      float angle = seed * 6.2831853 * (2.0 + floor(aLayer * 3.0));
      float radius = 0.7 + aLayer * 2.8;
      vec3 target = vec3(cos(angle) * radius, sin(angle) * radius * 0.62, -1.8 - aLayer * 2.1);

      if (uMode < 0.5) {
        float side = seed < 0.5 ? -1.0 : 1.0;
        target = vec3(side * (0.65 + aLayer * 2.2), sin(angle * 2.0) * 1.25, -1.4 - aLayer * 2.4);
      } else if (uMode < 1.5) {
        target = vec3(cos(angle) * radius, (seed - 0.5) * 4.2, sin(angle) * radius - 2.8);
        target.xz = rot(aLayer * 2.4) * target.xz;
      } else if (uMode < 2.5) {
        target = vec3((seed - 0.5) * 0.34, (aLayer - 0.5) * 5.4, -1.6 - abs(seed - 0.5) * 6.0);
      } else if (uMode < 3.5) {
        target = vec3((seed - 0.5) * 5.0, -1.8 + aLayer * 4.6, -1.4 - aLayer * 2.8);
        target.x += sin(aLayer * 28.0 + uTime * 1.8) * 0.42;
      } else if (uMode < 4.5) {
        target = vec3((seed - 0.5) * 6.0, sin(seed * 38.0) * 0.55, -1.8 - aLayer * 3.0);
      } else if (uMode < 5.5) {
        target = vec3((seed - 0.5) * 6.2, sin(seed * 44.0 + uTime * 2.0) * (0.3 + aLayer), -1.7 - aLayer * 2.4);
      } else if (uMode < 6.5) {
        target = vec3((floor(seed * 9.0) - 4.0) * 0.62, (floor(aLayer * 7.0) - 3.0) * 0.55, -2.3);
      } else if (uMode < 7.5) {
        target = vec3(cos(angle) * radius, sin(angle) * radius * 0.7, -2.0 - aLayer * 2.0);
      } else if (uMode < 8.5) {
        target = vec3((floor(seed * 8.0) - 3.5) * 0.72, 2.8 - aLayer * 5.6, -1.7 - mod(floor(seed * 24.0), 3.0));
      } else if (uMode < 9.5) {
        float side = seed < 0.5 ? -1.0 : 1.0;
        target = vec3(side * (0.3 + aLayer * 2.7), (seed - 0.5) * 4.2, -2.0 - aLayer * 2.0);
      } else {
        target = vec3((floor(seed * 7.0) - 3.0) * 0.72, (floor(aLayer * 6.0) - 2.5) * 0.62, -2.15);
      }

      vec3 scattered = normalize(position + vec3(0.001)) * (8.0 + aLayer * 8.0);
      float assemble = smoothstep(0.0, 0.58, uProgress);
      float release = smoothstep(0.72, 1.0, uProgress);
      vec3 animated = mix(scattered, target, assemble);
      animated += normalize(target + vec3(0.001)) * release * (1.0 + aLayer * 4.0);
      animated.z += sin(seed * 71.0 + uTime * 3.0) * 0.12;
      vec4 view = modelViewMatrix * vec4(animated, 1.0);
      float envelope = smoothstep(0.0, 0.12, uProgress) * (1.0 - smoothstep(0.78, 1.0, uProgress));
      gl_PointSize = (2.4 + aLayer * 5.2) * envelope * (50.0 / max(2.0, -view.z));
      gl_Position = projectionMatrix * view;
      vAlpha = envelope * (0.38 + aLayer * 0.62);
      vMix = seed;
    }
  `,
  fragmentShader: `
    uniform vec3 uAccent;
    uniform vec3 uSecondary;
    varying float vAlpha;
    varying float vMix;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float alpha = (1.0 - smoothstep(0.08, 0.5, d)) * vAlpha;
      vec3 color = mix(uAccent, uSecondary, smoothstep(0.25, 0.86, vMix));
      gl_FragColor = vec4(color * (1.15 + (1.0 - d) * 1.2), alpha);
    }
  `,
};

export class ArrivalSequence {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly material: THREE.ShaderMaterial;
  private age = 10;
  private readonly duration = 1.45;

  constructor(preset: QualityPreset) {
    const count = preset === 'low' ? 110 : preset === 'medium' ? 320 : 700;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const layers = new Float32Array(count);
    let state = 0x72ad913;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = random() * 2 - 1;
      positions[i * 3 + 1] = random() * 2 - 1;
      positions[i * 3 + 2] = random() * 2 - 1;
      seeds[i] = random();
      layers[i] = random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));
    this.material = new THREE.ShaderMaterial({
      ...shader,
      uniforms: THREE.UniformsUtils.clone(shader.uniforms),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.name = 'World-specific cinematic arrival signature';
    this.points.frustumCulled = false;
    this.points.renderOrder = 62;
    this.points.visible = false;
  }

  mount(parent: THREE.Group, mobile: boolean): void {
    parent.add(this.points);
    this.points.position.set(mobile ? 0 : -0.15, mobile ? 0.2 : 0.05, mobile ? -1.5 : -0.85);
    this.points.scale.setScalar(mobile ? 0.78 : 1);
  }

  trigger(mode: number, accent: THREE.Color, secondary: THREE.Color): void {
    this.age = 0;
    this.material.uniforms.uMode.value = mode;
    this.material.uniforms.uAccent.value.copy(accent);
    this.material.uniforms.uSecondary.value.copy(secondary);
    this.points.visible = true;
  }

  update(delta: number, elapsed: number): void {
    this.age += delta;
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uProgress.value = Math.min(1, this.age / this.duration);
    if (this.age >= this.duration) this.points.visible = false;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}
