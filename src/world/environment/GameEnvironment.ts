import * as THREE from 'three';
import type { QualitySettings } from '../../core/quality';
import { EnvironmentParticles } from './EnvironmentParticles';
import type { WorldTheme } from './WorldTheme';

interface CompatibilityRig {
  left: THREE.Mesh;
  right: THREE.Mesh;
  bridge: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  rings: THREE.Group;
}

interface IdeasRig {
  fragments: THREE.InstancedMesh;
  seeds: Float32Array;
  centre: THREE.Mesh;
  halo: THREE.Group;
}

interface BoundariesRig {
  grid: THREE.LineSegments;
  frames: THREE.Group;
}

function markOpacity(material: THREE.Material, opacity: number): void {
  material.transparent = true;
  material.opacity = opacity;
  material.depthWrite = false;
  material.userData.environmentOpacity = opacity;
}

export class GameEnvironment {
  readonly group = new THREE.Group();
  private readonly moduleRoot = new THREE.Group();
  private readonly particles: EnvironmentParticles;
  private readonly accentLight = new THREE.PointLight(0xffffff, 0, 10, 2);
  private readonly secondaryLight = new THREE.PointLight(0xffffff, 0, 9, 2);
  private readonly quality: QualitySettings;
  private theme: WorldTheme | null = null;
  private compatibility: CompatibilityRig | null = null;
  private ideas: IdeasRig | null = null;
  private boundaries: BoundariesRig | null = null;
  private impact = 0;
  private mobile = false;

  constructor(quality: QualitySettings, label: string) {
    this.quality = quality;
    this.group.name = `Reusable GameEnvironment ${label}`;
    this.moduleRoot.name = 'World-specific geometry module';
    this.particles = new EnvironmentParticles(quality.preset);
    this.accentLight.position.set(-2.8, 1.2, -0.2);
    this.secondaryLight.position.set(3.1, 0.4, -1.8);
    this.group.add(this.moduleRoot, this.particles.points, this.accentLight, this.secondaryLight);
    this.group.visible = false;
  }

  configure(theme: WorldTheme): void {
    this.clearModule();
    this.theme = theme;
    this.group.name = `Reusable GameEnvironment: ${theme.kind} ${theme.index + 1}`;
    this.particles.setTheme(theme);
    this.accentLight.color.copy(theme.accent);
    this.secondaryLight.color.copy(theme.secondary);
    if (theme.kind === 'compatibility') this.buildCompatibility(theme);
    else if (theme.kind === 'ideas') this.buildIdeas(theme);
    else if (theme.kind === 'boundaries') this.buildBoundaries(theme);
    else this.buildConstellation(theme);
    this.setMobile(this.mobile);
  }

  setMobile(mobile: boolean): void {
    this.mobile = mobile;
    this.moduleRoot.position.set(0, mobile ? 0.18 : 0, mobile ? -1.1 : -0.55);
    this.particles.points.position.z = mobile ? -0.65 : 0;
    if (this.ideas) {
      // Keep the world's secondary thought nucleus as background scenery on
      // phones instead of letting it visually merge with the interactive core.
      this.ideas.centre.position.set(mobile ? 2.55 : -0.2, mobile ? 0.55 : 0.35, mobile ? -3 : -2.65);
    }
  }

  impactBurst(strength: number): void {
    this.impact = Math.max(this.impact, THREE.MathUtils.clamp(strength / 2.25, 0.32, 1));
    this.particles.impactBurst(strength);
  }

  update(
    delta: number,
    elapsed: number,
    reveal: number,
    disperse: number,
    pointer: THREE.Vector2,
  ): void {
    if (!this.theme) return;
    this.group.visible = reveal > 0.002 || disperse > 0.002;
    if (!this.group.visible) return;
    this.impact = Math.max(0, this.impact - delta * 1.5);
    const easedReveal = THREE.MathUtils.smoothstep(reveal, 0, 1);
    const baseScale = THREE.MathUtils.lerp(0.58, 1, easedReveal);
    const impactPulse = this.impact * Math.sin(Math.min(1, this.impact * 1.25) * Math.PI) * 0.055;
    this.group.position.set(0, 0, 0);
    this.group.rotation.x = 0;
    this.group.rotation.y = 0;
    this.group.scale.setScalar(baseScale + impactPulse);
    this.group.rotation.z = pointer.x * 0.012 * easedReveal;
    this.moduleRoot.position.x = pointer.x * (this.mobile ? 0.12 : 0.28);
    this.moduleRoot.position.y = (this.mobile ? 0.18 : 0) - pointer.y * (this.mobile ? 0.08 : 0.18);
    this.setVisualOpacity(easedReveal * (1 - disperse * 0.72));
    this.accentLight.intensity = easedReveal * this.theme.lightEnergy * (1.8 + this.impact * 3.2);
    this.secondaryLight.intensity = easedReveal * this.theme.lightEnergy * (1.25 + this.impact * 2.2);
    this.particles.update(delta, elapsed, easedReveal, disperse, pointer);
    if (this.compatibility) this.updateCompatibility(delta, elapsed, pointer, disperse);
    if (this.ideas) this.updateIdeas(delta, elapsed, pointer, disperse, easedReveal);
    if (this.boundaries) this.updateBoundaries(elapsed, pointer);
  }

  dispose(): void {
    this.clearModule();
    this.particles.dispose();
    this.group.removeFromParent();
  }

  private buildCompatibility(theme: WorldTheme): void {
    const orbGeometry = new THREE.IcosahedronGeometry(0.86, this.quality.preset === 'low' ? 1 : 2);
    const leftMaterial = new THREE.MeshPhysicalMaterial({
      color: theme.accent.clone().multiplyScalar(0.22),
      emissive: theme.accent,
      emissiveIntensity: 1.1,
      roughness: 0.2,
      metalness: 0.72,
      wireframe: true,
      blending: THREE.AdditiveBlending,
    });
    const rightMaterial = new THREE.MeshPhysicalMaterial({
      color: theme.secondary.clone().multiplyScalar(0.22),
      emissive: theme.secondary,
      emissiveIntensity: 1.05,
      roughness: 0.22,
      metalness: 0.68,
      wireframe: true,
      blending: THREE.AdditiveBlending,
    });
    markOpacity(leftMaterial, 0.58);
    markOpacity(rightMaterial, 0.54);
    const left = new THREE.Mesh(orbGeometry, leftMaterial);
    const right = new THREE.Mesh(orbGeometry, rightMaterial);
    left.name = 'Compatibility energy body A';
    right.name = 'Compatibility energy body B';
    left.position.set(-2.35, 0.4, -2.15);
    right.position.set(2.35, 0.4, -2.15);

    const bridgePositions = new Float32Array(40 * 3);
    const bridgeGeometry = new THREE.BufferGeometry();
    bridgeGeometry.setAttribute('position', new THREE.BufferAttribute(bridgePositions, 3));
    const bridgeMaterial = new THREE.LineBasicMaterial({
      color: theme.accent.clone().lerp(theme.secondary, 0.5),
      blending: THREE.AdditiveBlending,
    });
    markOpacity(bridgeMaterial, 0.58);
    const bridge = new THREE.Line(bridgeGeometry, bridgeMaterial);
    bridge.name = 'Compatibility living energy bond';

    const rings = new THREE.Group();
    rings.name = 'Compatibility giant orbital scale';
    for (let index = 0; index < 2; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: index % 2 ? theme.secondary : theme.accent,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      markOpacity(material, 0.055 + index * 0.02);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.8 + index * 1.2, 0.018 + index * 0.008, 5, 112),
        material,
      );
      ring.position.z = -3.3 - index * 0.5;
      ring.rotation.set(index * 0.24, index * 0.17, index * 0.48);
      rings.add(ring);
    }
    this.moduleRoot.add(rings, bridge, left, right);
    this.compatibility = { left, right, bridge, rings };
  }

  private updateCompatibility(
    delta: number,
    elapsed: number,
    pointer: THREE.Vector2,
    disperse: number,
  ): void {
    const rig = this.compatibility!;
    const attraction = 2.4 - Math.sin(elapsed * 0.78) * 0.34 - this.impact * 0.28;
    const recoil = disperse * 2.3;
    rig.left.position.x = -attraction - recoil;
    rig.right.position.x = attraction + recoil;
    rig.left.position.y = 0.34 + Math.sin(elapsed * 1.12) * 0.22 + pointer.y * 0.2;
    rig.right.position.y = 0.42 - Math.sin(elapsed * 1.12) * 0.22 - pointer.y * 0.2;
    rig.left.rotation.x += delta * 0.42;
    rig.left.rotation.y -= delta * 0.56;
    rig.right.rotation.x -= delta * 0.38;
    rig.right.rotation.y += delta * 0.52;
    rig.rings.rotation.z += delta * (0.035 + this.impact * 0.14);
    rig.rings.rotation.y = pointer.x * 0.08;

    const attribute = rig.bridge.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < attribute.count; index += 1) {
      const progress = index / (attribute.count - 1);
      const x = THREE.MathUtils.lerp(rig.left.position.x, rig.right.position.x, progress);
      const arc = Math.sin(progress * Math.PI);
      const y = THREE.MathUtils.lerp(rig.left.position.y, rig.right.position.y, progress)
        + Math.sin(progress * Math.PI * 5 + elapsed * 4.2) * arc * (0.08 + this.impact * 0.12);
      const z = -2.15 + Math.cos(progress * Math.PI * 7 - elapsed * 3.1) * arc * (0.07 + this.impact * 0.1);
      attribute.setXYZ(index, x, y, z);
    }
    attribute.needsUpdate = true;
  }

  private buildIdeas(theme: WorldTheme): void {
    const count = this.quality.preset === 'low' ? 12 : this.quality.preset === 'medium' ? 18 : 26;
    const geometry = new THREE.TetrahedronGeometry(0.16, 0);
    const material = new THREE.MeshPhysicalMaterial({
      color: theme.accent.clone().multiplyScalar(0.28),
      emissive: theme.accent,
      emissiveIntensity: 0.4,
      metalness: 0.7,
      roughness: 0.26,
      clearcoat: 0.6,
    });
    markOpacity(material, 0.4);
    const fragments = new THREE.InstancedMesh(geometry, material, count);
    fragments.name = 'Ideas instanced thought fragments';
    fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fragments.frustumCulled = false;
    const seeds = new Float32Array(count * 4);
    for (let index = 0; index < count; index += 1) {
      seeds[index * 4] = (index * 0.61803398875) % 1;
      seeds[index * 4 + 1] = (index * 0.41421356237 + 0.17) % 1;
      seeds[index * 4 + 2] = (index * 0.73205080756 + 0.31) % 1;
      seeds[index * 4 + 3] = 0.55 + (index % 7) * 0.09;
    }

    const centreMaterial = new THREE.MeshBasicMaterial({
      color: theme.secondary,
      wireframe: true,
      blending: THREE.AdditiveBlending,
    });
    markOpacity(centreMaterial, 0.3);
    const centre = new THREE.Mesh(new THREE.DodecahedronGeometry(0.92, 1), centreMaterial);
    centre.name = 'Ideas forming thought nucleus';
    centre.position.set(-0.2, 0.35, -2.65);

    const halo = new THREE.Group();
    halo.name = 'Ideas incomplete construction arcs';
    for (let index = 0; index < 1; index += 1) {
      const haloMaterial = new THREE.MeshBasicMaterial({
        color: index % 2 ? theme.secondary : theme.accent,
        blending: THREE.AdditiveBlending,
      });
      markOpacity(haloMaterial, 0.07);
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(2.2 + index * 1.15, 0.025, 5, 96, Math.PI * (1.1 + index * 0.14)),
        haloMaterial,
      );
      arc.position.z = -2.8 - index * 0.34;
      arc.rotation.set(index * 0.45, index * 0.3, index * 1.2);
      halo.add(arc);
    }
    this.moduleRoot.add(halo, fragments, centre);
    this.ideas = { fragments, seeds, centre, halo };
  }

  private updateIdeas(
    delta: number,
    elapsed: number,
    pointer: THREE.Vector2,
    disperse: number,
    reveal: number,
  ): void {
    const rig = this.ideas!;
    const dummy = new THREE.Object3D();
    for (let index = 0; index < rig.fragments.count; index += 1) {
      const seedA = rig.seeds[index * 4];
      const seedB = rig.seeds[index * 4 + 1];
      const seedC = rig.seeds[index * 4 + 2];
      const size = rig.seeds[index * 4 + 3];
      const angle = seedA * Math.PI * 2 + elapsed * (0.08 + seedC * 0.13);
      const radius = 1.25 + seedB * 4.2 + disperse * (2.2 + seedC * 3.4);
      dummy.position.set(
        Math.cos(angle) * radius + pointer.x * seedB * 0.5,
        -1.75 + seedC * 4.8 + Math.sin(elapsed * 0.72 + seedA * 19) * 0.18,
        -2.1 + Math.sin(angle) * radius * 0.48 - seedB * 2.4,
      );
      dummy.rotation.set(angle + elapsed * 0.3, seedB * 7 + elapsed * 0.22, seedC * 8 - elapsed * 0.18);
      dummy.scale.setScalar(size * reveal * (1 + this.impact * (0.22 + seedC * 0.28)));
      dummy.updateMatrix();
      rig.fragments.setMatrixAt(index, dummy.matrix);
    }
    rig.fragments.instanceMatrix.needsUpdate = true;
    rig.centre.rotation.x += delta * (0.22 + this.impact * 0.5);
    rig.centre.rotation.y -= delta * (0.3 + this.impact * 0.65);
    rig.centre.scale.setScalar(0.84 + Math.sin(elapsed * 1.4) * 0.08 + this.impact * 0.16);
    rig.halo.rotation.z -= delta * (0.07 + this.impact * 0.24);
    rig.halo.rotation.y = pointer.x * 0.12;
  }

  private buildConstellation(theme: WorldTheme): void {
    const rootMaterial = new THREE.MeshBasicMaterial({
      color: theme.accent,
      wireframe: true,
      blending: THREE.AdditiveBlending,
    });
    markOpacity(rootMaterial, 0.07);
    for (let index = 0; index < 1; index += 1) {
      const structure = new THREE.Mesh(
        new THREE.TorusKnotGeometry(1.8 + index * 0.72, 0.018 + index * 0.006, 120, 5, 2 + index, 3),
        rootMaterial.clone(),
      );
      markOpacity(structure.material as THREE.Material, 0.07);
      structure.position.set(2.8, -0.2, -4.1);
      structure.rotation.set(index * 0.5, index * 0.7, index * 0.9);
      this.moduleRoot.add(structure);
    }
    rootMaterial.dispose();
  }

  private buildBoundaries(theme: WorldTheme): void {
    const gridPositions: number[] = [];
    for (let x = -5; x <= 5; x += 1) gridPositions.push(x, -3.7, -4.8, x, 3.7, -4.8);
    for (let y = -3; y <= 3; y += 1) gridPositions.push(-5.4, y, -4.8, 5.4, y, -4.8);
    const gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
    const gridMaterial = new THREE.LineBasicMaterial({
      color: theme.accent,
      blending: THREE.AdditiveBlending,
    });
    markOpacity(gridMaterial, 0.105);
    const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
    grid.name = 'Domino Borders quiet spatial grid';

    const frames = new THREE.Group();
    frames.name = 'Domino Borders boundary gates';
    for (let index = 0; index < 2; index += 1) {
      const width = 8.4 + index * 2.4;
      const height = 5.3 + index * 1.5;
      const points = [
        new THREE.Vector3(-width / 2, -height / 2, 0),
        new THREE.Vector3(width / 2, -height / 2, 0),
        new THREE.Vector3(width / 2, height / 2, 0),
        new THREE.Vector3(-width / 2, height / 2, 0),
      ];
      const material = new THREE.LineBasicMaterial({
        color: index ? theme.secondary : theme.accent,
        blending: THREE.AdditiveBlending,
      });
      markOpacity(material, index ? 0.075 : 0.13);
      const frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
      frame.position.z = -4.25 - index * 0.8;
      frames.add(frame);
    }
    this.moduleRoot.add(grid, frames);
    this.boundaries = { grid, frames };
  }

  private updateBoundaries(elapsed: number, pointer: THREE.Vector2): void {
    const rig = this.boundaries!;
    rig.grid.position.x = pointer.x * 0.18;
    rig.grid.position.y = -pointer.y * 0.1;
    rig.frames.rotation.z = Math.sin(elapsed * 0.16) * 0.012;
    rig.frames.scale.setScalar(1 + Math.sin(elapsed * 0.42) * 0.012 + this.impact * 0.025);
  }

  private setVisualOpacity(reveal: number): void {
    this.moduleRoot.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        const base = typeof material.userData.environmentOpacity === 'number'
          ? material.userData.environmentOpacity as number
          : 1;
        material.opacity = base * reveal;
      });
    });
  }

  private clearModule(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.moduleRoot.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.forEach((material) => materials.add(material));
    });
    this.moduleRoot.clear();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.compatibility = null;
    this.ideas = null;
    this.boundaries = null;
  }
}
