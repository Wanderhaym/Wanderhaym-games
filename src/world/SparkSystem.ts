import * as THREE from 'three';

const vertexShader = `
  uniform float uTime;
  attribute vec3 aVelocity;
  attribute float aStart;
  attribute float aDuration;
  attribute float aSeed;
  varying float vAlpha;
  varying float vHeat;

  void main() {
    float age = uTime - aStart;
    float life = clamp(age / max(0.001, aDuration), 0.0, 1.0);
    float alive = step(0.0, age) * (1.0 - step(1.0, life));
    vec3 animated = position + aVelocity * age;
    animated.y -= 3.8 * age * age;
    animated.x += sin(age * 17.0 + aSeed * 11.0) * age * 0.16;
    animated.z += cos(age * 13.0 + aSeed * 7.0) * age * 0.1;
    vec4 viewPosition = modelViewMatrix * vec4(animated, 1.0);
    float fadeIn = smoothstep(0.0, 0.08, life);
    float fadeOut = 1.0 - smoothstep(0.45, 1.0, life);
    vAlpha = alive * fadeIn * fadeOut;
    vHeat = 1.0 - life;
    gl_PointSize = (2.0 + aSeed * 2.6) * (1.0 + vHeat * 0.38) * (34.0 / max(2.0, -viewPosition.z));
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vAlpha;
  varying float vHeat;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float radius = length(point);
    float core = 1.0 - smoothstep(0.05, 0.5, radius);
    float glow = 1.0 - smoothstep(0.18, 0.5, radius);
    vec3 color = mix(uColorB, uColorA, vHeat) * (core * 1.05 + glow * 0.36);
    gl_FragColor = vec4(color, vAlpha * (core + glow * 0.3));
  }
`;

export class SparkSystem {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly starts: Float32Array;
  private readonly durations: Float32Array;
  private readonly seeds: Float32Array;
  private readonly material: THREE.ShaderMaterial;
  private readonly count: number;
  private elapsed = 0;
  private cursor = 0;

  constructor(count: number) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.starts = new Float32Array(count);
    this.durations = new Float32Array(count);
    this.seeds = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      this.positions[index * 3 + 1] = -100;
      this.starts[index] = 100000;
      this.durations[index] = 1;
      this.seeds[index] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(this.velocities, 3));
    geometry.setAttribute('aStart', new THREE.BufferAttribute(this.starts, 1));
    geometry.setAttribute('aDuration', new THREE.BufferAttribute(this.durations, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(0xfff2bd) },
        uColorB: { value: new THREE.Color(0xff6818) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.name = 'GPU forge particles';
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  burst(origin: THREE.Vector3, accent?: THREE.Color, portion = 0.72, power = 1): void {
    if (accent) this.material.uniforms.uColorB.value.copy(accent);
    const burstCount = Math.max(12, Math.min(this.count, Math.floor(this.count * portion)));
    const velocityScale = THREE.MathUtils.clamp(0.72 + power * 0.34, 0.8, 1.55);
    for (let item = 0; item < burstCount; item += 1) {
      const index = (this.cursor + item) % this.count;
      const offset = index * 3;
      const angle = Math.random() * Math.PI * 2;
      const planar = 1.2 + Math.random() * 4.2;
      const towardViewer = 0.4 + Math.random() * 3.8;
      this.positions[offset] = origin.x + (Math.random() - 0.5) * 0.2;
      this.positions[offset + 1] = origin.y + (Math.random() - 0.5) * 0.13;
      this.positions[offset + 2] = origin.z + (Math.random() - 0.5) * 0.2;
      this.velocities[offset] = Math.cos(angle) * planar * velocityScale;
      this.velocities[offset + 1] = (1.7 + Math.sin(angle) * planar * 0.7 + Math.random() * 3.5) * velocityScale;
      this.velocities[offset + 2] = (Math.sin(angle * 0.7) * planar + towardViewer) * velocityScale;
      this.starts[index] = this.elapsed + Math.random() * 0.16;
      this.durations[index] = (0.62 + Math.random() * 0.82) * (0.9 + Math.min(0.32, power * 0.14));
      this.seeds[index] = Math.random();
    }
    this.cursor = (this.cursor + burstCount) % this.count;

    ['position', 'aVelocity', 'aStart', 'aDuration', 'aSeed'].forEach((name) => {
      (this.points.geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    });
  }

  update(delta: number): void {
    this.elapsed += delta;
    this.material.uniforms.uTime.value = this.elapsed;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
