import * as THREE from 'three';

interface PendingDestination {
  parent: THREE.Group;
  index: number;
  accent: THREE.Color;
  relocated: boolean;
}

const coreShader = {
  uniforms: {
    uTime: { value: 0 },
    uMode: { value: 0 },
    uEnergy: { value: 0.65 },
    uAccent: { value: new THREE.Color(0x82ffd0) },
    uPointer: { value: new THREE.Vector2() },
    uImpact: { value: 0 },
  },
  vertexShader: `
    uniform float uTime;
    uniform float uMode;
    uniform float uEnergy;
    uniform float uImpact;
    uniform vec2 uPointer;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying float vWave;

    void main() {
      float waveA = sin(position.y * (4.4 + mod(uMode, 3.0)) + uTime * 1.35 + uMode);
      float waveB = sin(position.x * 5.2 - position.z * 3.7 - uTime * 1.08);
      float pointerWave = dot(normalize(position.xy + vec2(0.001)), normalize(uPointer + vec2(0.001)));
      float impactWave = sin(length(position) * 18.0 - uTime * 13.0) * uImpact;
      float displacement = (waveA * 0.045 + waveB * 0.035 + pointerWave * 0.018 + impactWave * 0.075) * uEnergy;
      vec3 transformed = position + normal * displacement;
      vec4 world = modelMatrix * vec4(transformed, 1.0);
      vWorldPosition = world.xyz;
      vNormal = normalize(normalMatrix * normal);
      vWave = waveA * 0.5 + 0.5;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: `
    uniform vec3 uAccent;
    uniform float uEnergy;
    uniform float uImpact;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying float vWave;

    void main() {
      vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
      float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormal), viewDirection)), 2.25);
      float facets = pow(max(0.0, dot(normalize(vNormal), normalize(vec3(-0.4, 0.75, 0.5)))), 4.0);
      vec3 iron = vec3(0.018, 0.012, 0.009);
      vec3 ember = mix(vec3(0.28, 0.018, 0.002), vec3(1.0, 0.34, 0.025), pow(vWave, 2.2));
      vec3 color = mix(iron, ember, 0.48 + vWave * 0.38);
      color = mix(color, uAccent * (0.48 + vWave * 0.2), fresnel * 0.62);
      color += uAccent * facets * 0.55;
      color += vec3(1.0, 0.19, 0.015) * uImpact * (0.55 + vWave * 1.25);
      color += uAccent * fresnel * uEnergy * 0.4;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

const fireParticleShader = {
  uniforms: {
    uTime: { value: 0 },
    uImpact: { value: 0 },
    uAccent: { value: new THREE.Color(0x82ffd0) },
  },
  vertexShader: `
    uniform float uTime;
    uniform float uImpact;
    attribute float aSeed;
    attribute float aSpeed;
    varying float vAlpha;
    varying float vHeat;

    void main() {
      float cycle = fract(uTime * aSpeed + aSeed);
      vec3 radial = normalize(position + vec3(0.001));
      vec3 animated = radial * (0.88 + cycle * (0.58 + uImpact * 0.38));
      animated.y += cycle * (0.62 + uImpact * 0.7);
      animated.x += sin(uTime * 3.2 + aSeed * 31.0) * cycle * 0.12;
      animated.z += cos(uTime * 2.7 + aSeed * 23.0) * cycle * 0.12;
      vec4 viewPosition = modelViewMatrix * vec4(animated, 1.0);
      vAlpha = sin(cycle * 3.14159265) * (0.34 + uImpact * 0.66);
      vHeat = 1.0 - cycle;
      gl_PointSize = (2.2 + aSeed * 3.2) * (1.0 + uImpact * 1.4) * (42.0 / max(2.0, -viewPosition.z));
      gl_Position = projectionMatrix * viewPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uAccent;
    varying float vAlpha;
    varying float vHeat;
    void main() {
      float radius = length(gl_PointCoord - 0.5);
      float flame = 1.0 - smoothstep(0.08, 0.5, radius);
      vec3 hot = mix(vec3(1.0, 0.08, 0.005), vec3(1.0, 0.88, 0.28), pow(vHeat, 2.0));
      vec3 color = mix(hot, uAccent, (1.0 - vHeat) * 0.34);
      gl_FragColor = vec4(color * (0.7 + flame), flame * vAlpha);
    }
  `,
};

export class CoreArtifact {
  readonly group = new THREE.Group();
  private readonly coreMaterial = new THREE.ShaderMaterial(coreShader);
  private readonly wireMaterial = new THREE.MeshBasicMaterial({
    color: 0x82ffd0,
    wireframe: true,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
  });
  private readonly ringMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x15202a,
    emissive: 0x82ffd0,
    emissiveIntensity: 1.15,
    roughness: 0.2,
    metalness: 0.92,
    clearcoat: 0.85,
  });
  private readonly shardMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x3a4b57,
    emissive: 0x82ffd0,
    emissiveIntensity: 0.48,
    roughness: 0.27,
    metalness: 0.82,
  });
  private readonly core: THREE.Mesh;
  private readonly wire: THREE.Mesh;
  private readonly rings = new THREE.Group();
  private readonly shards = new THREE.Group();
  private readonly light = new THREE.PointLight(0x82ffd0, 5.5, 8, 2);
  private readonly fireMaterial = new THREE.ShaderMaterial({
    ...fireParticleShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly fire: THREE.Points;
  private readonly shockwaveMaterial = new THREE.MeshBasicMaterial({
    color: 0xff6a12,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly shockwave: THREE.Mesh;
  private readonly interactionMesh: THREE.Mesh;
  private readonly accent = new THREE.Color(0x82ffd0);
  private readonly fireColor = new THREE.Color(0xff5a0a);
  private pending: PendingDestination | null = null;
  private mode = 0;
  private visualScale = 1;
  private impactEnergy = 0;
  private impactStrength = 1;
  private shockwaveAge = 10;
  private baseScale = 1;
  private readonly layoutPosition = new THREE.Vector3(-0.25, 0.12, -0.2);

  constructor() {
    this.group.name = 'Wanderhaym procedural world core';
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.02, 5), this.coreMaterial);
    this.core.castShadow = true;
    this.wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.12, 2), this.wireMaterial);

    const ringGeometry = new THREE.TorusGeometry(1.52, 0.027, 8, 96);
    for (let index = 0; index < 3; index += 1) {
      const ring = new THREE.Mesh(ringGeometry, this.ringMaterial);
      ring.rotation.set(index * 0.78, index * 0.62, index * 1.1);
      this.rings.add(ring);
    }

    const shardGeometry = new THREE.OctahedronGeometry(0.115, 0);
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2;
      const shard = new THREE.Mesh(shardGeometry, this.shardMaterial);
      shard.position.set(Math.cos(angle) * 1.92, Math.sin(angle * 2.0) * 0.62, Math.sin(angle) * 1.92);
      shard.scale.setScalar(0.65 + (index % 4) * 0.16);
      shard.rotation.set(angle, angle * 1.7, -angle * 0.4);
      this.shards.add(shard);
    }

    this.light.position.set(0, 0.2, 0.6);
    const fireGeometry = new THREE.BufferGeometry();
    const fireCount = 112;
    const firePositions = new Float32Array(fireCount * 3);
    const fireSeeds = new Float32Array(fireCount);
    const fireSpeeds = new Float32Array(fireCount);
    for (let index = 0; index < fireCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const y = Math.random() * 2 - 1;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      firePositions[index * 3] = Math.cos(angle) * radius;
      firePositions[index * 3 + 1] = y;
      firePositions[index * 3 + 2] = Math.sin(angle) * radius;
      fireSeeds[index] = Math.random();
      fireSpeeds[index] = 0.17 + Math.random() * 0.22;
    }
    fireGeometry.setAttribute('position', new THREE.BufferAttribute(firePositions, 3));
    fireGeometry.setAttribute('aSeed', new THREE.BufferAttribute(fireSeeds, 1));
    fireGeometry.setAttribute('aSpeed', new THREE.BufferAttribute(fireSpeeds, 1));
    this.fire = new THREE.Points(fireGeometry, this.fireMaterial);
    this.fire.name = 'GPU fire mantle';
    this.fire.frustumCulled = false;

    this.shockwave = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.035, 8, 96), this.shockwaveMaterial);
    this.shockwave.name = 'Forge impact wave';
    this.shockwave.rotation.x = 0;
    this.shockwave.visible = false;
    this.interactionMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 20, 14),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    this.interactionMesh.name = 'Core interaction volume';
    this.interactionMesh.userData.artifactAction = 'next';
    this.group.add(this.light, this.shockwave, this.fire, this.rings, this.shards, this.wire, this.core, this.interactionMesh);
    this.setAccent(new THREE.Color(0x82ffd0));
  }

  mount(parent: THREE.Group, index: number, accent: THREE.Color): void {
    parent.add(this.group);
    this.group.position.copy(this.layoutPosition);
    this.mode = index;
    this.setAccent(accent);
  }

  beginJourney(parent: THREE.Group, index: number, accent: THREE.Color): void {
    this.pending = { parent, index, accent: accent.clone(), relocated: false };
  }

  impact(strength = 1): void {
    this.impactStrength = THREE.MathUtils.clamp(strength, 0.65, 2.25);
    this.impactEnergy = Math.max(this.impactEnergy, this.impactStrength);
    this.shockwaveAge = 0;
    this.shockwave.visible = true;
    this.shockwave.scale.setScalar(0.72 + this.impactStrength * 0.1);
    this.shockwaveMaterial.opacity = Math.min(1, 0.68 + this.impactStrength * 0.2);
  }

  getImpactEnergy(): number {
    return this.impactEnergy;
  }

  getInteractionObject(): THREE.Object3D {
    return this.interactionMesh;
  }

  setLayout(mobile: boolean): void {
    this.layoutPosition.set(mobile ? -0.98 : -0.25, mobile ? 0.08 : 0.12, mobile ? -1.05 : -0.2);
    this.baseScale = mobile ? 0.72 : 1;
    this.group.position.copy(this.layoutPosition);
  }

  update(delta: number, elapsed: number, journeyProgress: number, journeyIntensity: number, pointer: THREE.Vector2): void {
    if (this.pending) {
      if (!this.pending.relocated && journeyProgress >= 0.42) {
        this.pending.parent.add(this.group);
        this.group.position.copy(this.layoutPosition);
        this.mode = this.pending.index;
        this.setAccent(this.pending.accent);
        this.pending.relocated = true;
      }
      const collapse = this.pending.relocated
        ? THREE.MathUtils.smoothstep(journeyProgress, 0.42, 0.86)
        : 1 - THREE.MathUtils.smoothstep(journeyProgress, 0.04, 0.38);
      this.visualScale = THREE.MathUtils.lerp(this.visualScale, Math.max(0.015, collapse), 1 - Math.exp(-delta * 16));
      if (journeyProgress >= 1) this.pending = null;
    } else {
      this.visualScale = THREE.MathUtils.lerp(this.visualScale, 1, 1 - Math.exp(-delta * 8));
    }

    const energy = 0.72 + journeyIntensity * 1.65 + Math.sin(elapsed * 1.4) * 0.08;
    this.impactEnergy = Math.max(0, this.impactEnergy - delta * 1.35);
    this.shockwaveAge += delta;
    const shockDuration = 0.9 + this.impactStrength * 0.22;
    if (this.shockwaveAge < shockDuration) {
      const shockProgress = this.shockwaveAge / shockDuration;
      const shockRadius = 0.72 + this.impactStrength * 0.1 + shockProgress * (2.2 + this.impactStrength * 1.75);
      this.shockwave.scale.setScalar(shockRadius);
      this.shockwave.rotation.z += delta * (0.34 + this.impactStrength * 0.14);
      this.shockwaveMaterial.opacity = Math.pow(1 - shockProgress, 1.65) * Math.min(1, 0.58 + this.impactStrength * 0.24);
    } else {
      this.shockwave.visible = false;
      this.shockwaveMaterial.opacity = 0;
    }
    this.coreMaterial.uniforms.uTime.value = elapsed;
    this.coreMaterial.uniforms.uMode.value = this.mode;
    this.coreMaterial.uniforms.uEnergy.value = energy;
    this.coreMaterial.uniforms.uImpact.value = this.impactEnergy;
    this.coreMaterial.uniforms.uPointer.value.copy(pointer);
    this.fireMaterial.uniforms.uTime.value = elapsed;
    this.fireMaterial.uniforms.uImpact.value = this.impactEnergy;
    this.ringMaterial.emissiveIntensity = 0.9 + energy * 0.7 + this.impactEnergy * 2.8;
    this.shardMaterial.emissiveIntensity = 0.32 + energy * 0.28 + this.impactEnergy * 1.4;
    this.light.color.copy(this.accent).lerp(this.fireColor, this.impactEnergy * 0.72);
    this.light.intensity = 4.2 + energy * 2.4 + this.impactEnergy * 13;

    const pulse = 1 + Math.sin(elapsed * 1.8 + this.mode) * 0.035;
    this.group.scale.setScalar(this.baseScale * this.visualScale * pulse);
    this.core.rotation.y += delta * (0.19 + this.mode * 0.008);
    this.core.rotation.x = Math.sin(elapsed * 0.31) * 0.14;
    this.wire.rotation.y -= delta * 0.13;
    this.wire.rotation.z += delta * 0.08;
    this.rings.children.forEach((ring, index) => {
      ring.rotation.z += delta * (index % 2 ? -0.24 : 0.2) * (1 + journeyIntensity * 2.5);
      ring.rotation.x += delta * 0.035 * (index + 1);
    });
    this.shards.rotation.y -= delta * (0.12 + journeyIntensity * 0.35);
    this.shards.rotation.z = Math.sin(elapsed * 0.24) * 0.16;
    this.fire.rotation.y += delta * (0.11 + this.impactEnergy * 0.75);
  }

  getWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.group.getWorldPosition(target);
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) geometries.add(object.geometry);
    });
    geometries.forEach((geometry) => geometry.dispose());
    this.coreMaterial.dispose();
    this.wireMaterial.dispose();
    this.ringMaterial.dispose();
    this.shardMaterial.dispose();
    this.fireMaterial.dispose();
    this.shockwaveMaterial.dispose();
  }

  private setAccent(accent: THREE.Color): void {
    this.accent.copy(accent);
    this.coreMaterial.uniforms.uAccent.value.copy(accent);
    this.wireMaterial.color.copy(accent);
    this.ringMaterial.emissive.copy(accent);
    this.shardMaterial.emissive.copy(accent);
    this.light.color.copy(accent);
    this.fireMaterial.uniforms.uAccent.value.copy(accent);
    this.shockwaveMaterial.color.copy(accent).lerp(new THREE.Color(0xff6812), 0.72);
  }
}
