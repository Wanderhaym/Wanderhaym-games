import * as THREE from 'three';

export class SparkSystem {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly life: Float32Array;
  private readonly count: number;

  constructor(count: number) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.life = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      this.positions[i * 3 + 1] = -100;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffa028,
      size: 0.075,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  burst(origin: THREE.Vector3): void {
    for (let i = 0; i < this.count; i += 1) {
      const index = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const planar = 1.25 + Math.random() * 3.2;
      const towardViewer = 1.4 + Math.random() * 4.6;

      this.positions[index] = origin.x + (Math.random() - 0.5) * 0.13;
      this.positions[index + 1] = origin.y + Math.random() * 0.1;
      this.positions[index + 2] = origin.z + (Math.random() - 0.5) * 0.1;
      this.velocities[index] = Math.cos(angle) * planar;
      this.velocities[index + 1] = 1.6 + Math.sin(angle) * planar * 0.65 + Math.random() * 2.7;
      this.velocities[index + 2] = towardViewer;
      this.life[i] = 0.42 + Math.random() * 0.58;
    }

    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  update(delta: number): void {
    let changed = false;
    for (let i = 0; i < this.count; i += 1) {
      if (this.life[i] <= 0) continue;
      changed = true;
      const index = i * 3;
      this.life[i] -= delta;
      this.velocities[index] *= 0.984;
      this.velocities[index + 1] -= 7.4 * delta;
      this.velocities[index + 2] *= 0.975;
      this.positions[index] += this.velocities[index] * delta;
      this.positions[index + 1] += this.velocities[index + 1] * delta;
      this.positions[index + 2] += this.velocities[index + 2] * delta;

      if (this.life[i] <= 0) this.positions[index + 1] = -100;
    }

    if (changed) {
      (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
