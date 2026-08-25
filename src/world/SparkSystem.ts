import * as THREE from 'three';

export type SparkBurstShape = 'wave' | 'hammer' | 'transition';

const vertexShader = `
  uniform float uTime;
  attribute vec3 aVelocity;
  attribute float aStart;
  attribute float aDuration;
  attribute float aSeed;
  attribute float aSize;
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
    gl_PointSize = (2.0 + aSeed * 2.6) * aSize * (1.0 + vHeat * 0.38) * (34.0 / max(1.25, -viewPosition.z));
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
    vec3 color = mix(uColorB, uColorA, vHeat) * (core * 0.92 + glow * 0.18);
    gl_FragColor = vec4(color, vAlpha * (core + glow * 0.15));
  }
`;

export class SparkSystem {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly starts: Float32Array;
  private readonly durations: Float32Array;
  private readonly seeds: Float32Array;
  private readonly sizes: Float32Array;
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
    this.sizes = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      this.positions[index * 3 + 1] = -100;
      this.starts[index] = 100000;
      this.durations[index] = 1;
      this.seeds[index] = Math.random();
      this.sizes[index] = 1;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(this.velocities, 3));
    geometry.setAttribute('aStart', new THREE.BufferAttribute(this.starts, 1));
    geometry.setAttribute('aDuration', new THREE.BufferAttribute(this.durations, 1));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
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

  burst(
    origin: THREE.Vector3,
    accent?: THREE.Color,
    portion = 0.72,
    power = 1,
    viewerDirection?: THREE.Vector3,
    shape: SparkBurstShape = 'wave',
  ): void {
    if (accent) this.material.uniforms.uColorB.value.copy(accent);
    const burstCount = Math.max(5, Math.min(this.count, Math.floor(this.count * portion)));
    const velocityScale = THREE.MathUtils.clamp(0.62 + power * 0.36, 0.7, 1.5);
    const viewerX = viewerDirection?.x ?? 0;
    const viewerY = viewerDirection?.y ?? 0;
    const viewerZ = viewerDirection?.z ?? 1;
    // Only a small minority may pass near the viewer. The main body continues
    // the shockwave radially through the world instead of becoming a screen gun.
    const frontShare = shape === 'hammer'
      ? THREE.MathUtils.clamp(0.055 + power * 0.035, 0.06, 0.14)
      : shape === 'transition'
        ? THREE.MathUtils.clamp(0.07 + power * 0.025, 0.08, 0.13)
        : THREE.MathUtils.clamp(0.025 + power * 0.018, 0.03, 0.075);
    for (let item = 0; item < burstCount; item += 1) {
      const index = (this.cursor + item) % this.count;
      const offset = index * 3;
      const angle = Math.random() * Math.PI * 2;
      const planar = 1.2 + Math.random() * 4.2;
      const fliesAtScreen = Math.random() < frontShare;
      this.positions[offset] = origin.x + (Math.random() - 0.5) * 0.2;
      this.positions[offset + 1] = origin.y + (Math.random() - 0.5) * 0.13;
      this.positions[offset + 2] = origin.z + (Math.random() - 0.5) * 0.2;
      if (fliesAtScreen) {
        const forwardSpeed = (3.2 + Math.random() * 3.4 + power * 1.6) * velocityScale;
        const scatter = (0.42 + Math.random() * 0.82) * planar;
        this.velocities[offset] = viewerX * forwardSpeed + Math.cos(angle) * scatter;
        this.velocities[offset + 1] = viewerY * forwardSpeed + Math.sin(angle) * scatter + 0.38;
        this.velocities[offset + 2] = viewerZ * forwardSpeed + Math.sin(angle * 0.7) * scatter;
      } else {
        const volumetric = shape !== 'wave' || Math.random() < 0.38;
        const vertical = volumetric
          ? (Math.random() * 2 - 1) * (0.72 + power * 0.22)
          : (Math.random() - 0.5) * (0.22 + power * 0.07);
        const horizontal = Math.sqrt(Math.max(0.08, 1 - Math.min(0.92, vertical * vertical)));
        const radialX = Math.cos(angle) * horizontal;
        const radialZ = Math.sin(angle) * horizontal;
        const tangent = (Math.random() - 0.5) * (0.9 + power * 0.34);
        const radialSpeed = (2.6 + Math.random() * 4.2 + power * 1.75) * velocityScale;
        this.velocities[offset] = radialX * radialSpeed - radialZ * tangent;
        this.velocities[offset + 1] = vertical * radialSpeed + (shape === 'hammer' ? 1.1 : 0.34);
        this.velocities[offset + 2] = radialZ * radialSpeed + radialX * tangent;
      }
      this.starts[index] = this.elapsed + Math.random() * 0.16;
      this.durations[index] = (0.62 + Math.random() * 0.82) * (0.9 + Math.min(0.32, power * 0.14));
      this.seeds[index] = Math.random();
      this.sizes[index] = (0.56 + power * 0.3) * (fliesAtScreen ? 1.04 + power * 0.1 : 0.72 + Math.random() * 0.34);
    }
    this.cursor = (this.cursor + burstCount) % this.count;

    ['position', 'aVelocity', 'aStart', 'aDuration', 'aSeed', 'aSize'].forEach((name) => {
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
