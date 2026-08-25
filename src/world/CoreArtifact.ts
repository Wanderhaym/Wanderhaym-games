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
    uPortalHeat: { value: 0 },
  },
  vertexShader: `
    uniform float uTime;
    uniform float uMode;
    uniform float uEnergy;
    uniform float uImpact;
    uniform float uPortalHeat;
    uniform vec2 uPointer;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying float vWave;

    void main() {
      float waveA = sin(position.y * (4.4 + mod(uMode, 3.0)) + uTime * 1.35 + uMode);
      float waveB = sin(position.x * 5.2 - position.z * 3.7 - uTime * 1.08);
      float pointerWave = dot(normalize(position.xy + vec2(0.001)), normalize(uPointer + vec2(0.001)));
      float impactWave = sin(length(position) * 18.0 - uTime * 13.0) * uImpact;
      float heatPulse = sin(length(position) * 10.0 - uTime * (4.0 + uPortalHeat * 5.0)) * uPortalHeat;
      float displacement = (waveA * 0.045 + waveB * 0.035 + pointerWave * 0.018
        + impactWave * 0.075 + heatPulse * 0.038) * uEnergy;
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
    uniform float uPortalHeat;
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
      color += mix(vec3(1.0, 0.12, 0.005), vec3(1.0, 0.82, 0.18), vWave) * uPortalHeat * (0.38 + fresnel * 0.72);
      color += uAccent * fresnel * uEnergy * 0.4;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

const fireParticleShader = {
  uniforms: {
    uTime: { value: 0 },
    uImpact: { value: 0 },
    uPortalHeat: { value: 0 },
    uAccent: { value: new THREE.Color(0x82ffd0) },
  },
  vertexShader: `
    uniform float uTime;
    uniform float uImpact;
    uniform float uPortalHeat;
    attribute float aSeed;
    attribute float aSpeed;
    varying float vAlpha;
    varying float vHeat;

    void main() {
      float cycle = fract(uTime * aSpeed + aSeed);
      vec3 radial = normalize(position + vec3(0.001));
      vec3 animated = radial * (0.88 + cycle * (0.58 + uImpact * 0.38));
      animated.y += cycle * (0.62 + uImpact * 0.7 + uPortalHeat * 0.52);
      animated.x += sin(uTime * 3.2 + aSeed * 31.0) * cycle * 0.12;
      animated.z += cos(uTime * 2.7 + aSeed * 23.0) * cycle * 0.12;
      vec4 viewPosition = modelViewMatrix * vec4(animated, 1.0);
      float portalCleared = smoothstep(0.76, 1.0, uPortalHeat);
      vAlpha = sin(cycle * 3.14159265)
        * (0.24 + uImpact * 0.5 + uPortalHeat * 0.3)
        * mix(1.0, 0.16, portalCleared);
      vHeat = 1.0 - cycle;
      gl_PointSize = (2.2 + aSeed * 3.2) * (1.0 + uImpact * 1.15 + uPortalHeat * 0.72) * (42.0 / max(2.0, -viewPosition.z));
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

const destinationPreviewShader = {
  uniforms: {
    tPreview: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uReveal: { value: 0 },
    uAccent: { value: new THREE.Color(0x82ffd0) },
    uImpact: { value: 0 },
    uPointer: { value: new THREE.Vector2(0.5, 0.5) },
    uMode: { value: 0 },
    uWindowRadius: { value: 0.44 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tPreview;
    uniform float uTime;
    uniform float uReveal;
    uniform float uImpact;
    uniform vec3 uAccent;
    uniform vec2 uPointer;
    uniform float uMode;
    uniform float uWindowRadius;
    varying vec2 vUv;

    float hash(vec2 point) {
      return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 center = vUv - 0.5;
      vec2 local = center;
      float distanceToPointer = length(local);
      float angle = atan(local.y, local.x);
      float windowRadius = uWindowRadius;
      float effectScale = windowRadius / 0.19;
      float edgeNoise = sin(angle * 8.0 + uTime * 1.7) * 0.006 * effectScale
        + sin(angle * 15.0 - uTime * 1.25) * 0.003 * effectScale;
      float lens = 1.0 - distanceToPointer * distanceToPointer * (0.46 + uReveal * 0.12);
      vec2 shimmer = vec2(
        sin(local.y * 24.0 + uTime * 1.8),
        cos(local.x * 21.0 - uTime * 1.45)
      ) * (0.0035 + uImpact * 0.0045) * effectScale * (0.4 + distanceToPointer);
      vec2 sampleUv = clamp(vec2(0.5) + local * lens + shimmer, 0.01, 0.99);
      vec3 image = texture2D(tPreview, sampleUv).rgb;

      float gridMode = 1.0 - step(0.5, abs(uMode - 1.0));
      float waveformMode = 1.0 - step(0.5, abs(uMode - 2.0));
      float radarMode = 1.0 - step(0.5, abs(uMode - 3.0));
      float chainMode = 1.0 - step(0.5, abs(uMode - 4.0));
      float bondMode = 1.0 - step(0.5, abs(uMode - 5.0));
      float shardsMode = 1.0 - step(0.5, abs(uMode - 6.0));
      float decisionMode = 1.0 - step(0.5, abs(uMode - 7.0));
      float smokeMode = 1.0 - step(0.5, abs(uMode - 8.0));
      float truthMode = 1.0 - step(0.5, abs(uMode - 9.0));
      float organicMode = 1.0 - gridMode - waveformMode - radarMode - chainMode
        - bondMode - shardsMode - decisionMode - smokeMode - truthMode;

      float organicHole = (1.0 - smoothstep(
        windowRadius + edgeNoise - 0.018 * effectScale,
        windowRadius + edgeNoise + 0.014 * effectScale,
        distanceToPointer
      )) * uReveal;
      float gridHole = (1.0 - smoothstep(
        windowRadius - 0.025 * effectScale,
        windowRadius + 0.014 * effectScale,
        distanceToPointer
      )) * uReveal;
      float waveformEnvelope = 1.0 - smoothstep(
        windowRadius * 0.72,
        windowRadius,
        length(local * vec2(0.94, 1.0))
      );
      float waveformHole = waveformEnvelope * uReveal;
      float radarEnvelope = 1.0 - smoothstep(windowRadius * 0.82, windowRadius, distanceToPointer);
      float radarHole = radarEnvelope * uReveal;

      vec2 chainGridSize = vec2(9.0 / effectScale);
      vec2 chainCell = floor(vUv * chainGridSize);
      vec2 chainCenter = (chainCell + 0.5) / chainGridSize;
      float chainDistance = length(chainCenter - uPointer);
      float chainSeed = hash(chainCell + 17.0);
      float chainRadius = windowRadius - 0.012 * effectScale;
      float chainReach = 1.0 - smoothstep(
        chainRadius - 0.055 * effectScale + chainSeed * 0.035 * effectScale,
        chainRadius + 0.018 * effectScale + chainSeed * 0.035 * effectScale,
        chainDistance
      );
      float chainHole = chainReach * uReveal;

      float bondOffset = 0.06 * effectScale;
      float bondRadius = 0.13 * effectScale;
      float bondLeftDistance = length(local + vec2(bondOffset, 0.0));
      float bondRightDistance = length(local - vec2(bondOffset, 0.0));
      float bondLeft = 1.0 - smoothstep(
        bondRadius - 0.018 * effectScale,
        bondRadius + 0.014 * effectScale,
        bondLeftDistance
      );
      float bondRight = 1.0 - smoothstep(
        bondRadius - 0.018 * effectScale,
        bondRadius + 0.014 * effectScale,
        bondRightDistance
      );
      float bondHole = max(bondLeft, bondRight) * uReveal;

      float shardAngle = atan(local.y, local.x);
      float shardSeed = hash(vec2(
        floor((shardAngle / 6.2831853 + 0.5) * 13.0),
        floor(distanceToPointer * 15.0 / effectScale)
      ));
      float shardReach = 1.0 - smoothstep(
        windowRadius - 0.065 * effectScale + shardSeed * 0.045 * effectScale,
        windowRadius + 0.018 * effectScale + shardSeed * 0.045 * effectScale,
        distanceToPointer
      );
      float shardHole = shardReach * uReveal;

      float coinRotation = sin(uTime * 1.35) * 0.24;
      float coinCosine = cos(coinRotation);
      float coinSine = sin(coinRotation);
      vec2 coinPoint = mat2(coinCosine, -coinSine, coinSine, coinCosine) * local;
      float coinSquash = 0.72 + abs(cos(uTime * 1.75)) * 0.28;
      float coinDistance = length(vec2(coinPoint.x / coinSquash, coinPoint.y));
      float decisionHole = (1.0 - smoothstep(
        windowRadius - 0.015 * effectScale,
        windowRadius + 0.015 * effectScale,
        coinDistance
      )) * uReveal;

      float smokeNoise = sin(angle * 9.0 + uTime * 1.6) * 0.012 * effectScale
        + sin(angle * 15.0 - uTime * 1.15) * 0.007 * effectScale;
      float smokeHole = (1.0 - smoothstep(
        windowRadius + smokeNoise - 0.022 * effectScale,
        windowRadius + smokeNoise + 0.018 * effectScale,
        distanceToPointer
      )) * uReveal;

      float truthDistance = abs(local.x) + abs(local.y);
      float truthHole = (1.0 - smoothstep(
        windowRadius - 0.025 * effectScale,
        windowRadius + 0.012 * effectScale,
        truthDistance
      )) * uReveal;
      float aperture = organicHole * organicMode + gridHole * gridMode
        + waveformHole * waveformMode + radarHole * radarMode + chainHole * chainMode
        + bondHole * bondMode + shardHole * shardsMode + decisionHole * decisionMode
        + smokeHole * smokeMode + truthHole * truthMode;

      float vignette = 1.0 - smoothstep(windowRadius * 0.28, windowRadius, distanceToPointer);
      float organicRim = (1.0 - smoothstep(0.0, 0.018 * effectScale, abs(distanceToPointer - windowRadius - edgeNoise))) * organicMode;
      float gridRim = (1.0 - smoothstep(0.0, 0.03 * effectScale, abs(distanceToPointer - windowRadius))) * gridMode;
      float waveformRim = (1.0 - smoothstep(
        0.0,
        0.025 * effectScale,
        abs(length(local * vec2(0.94, 1.0)) - windowRadius)
      )) * waveformMode;
      float radarRim = (1.0 - smoothstep(0.0, 0.022 * effectScale, abs(distanceToPointer - windowRadius))) * radarMode;
      float chainRim = (1.0 - smoothstep(0.0, 0.042 * effectScale, abs(chainDistance - chainRadius))) * chainMode;
      float bondRim = max(
        1.0 - smoothstep(0.0, 0.02 * effectScale, abs(bondLeftDistance - bondRadius)),
        1.0 - smoothstep(0.0, 0.02 * effectScale, abs(bondRightDistance - bondRadius))
      ) * bondMode;
      float shardRim = (1.0 - smoothstep(0.0, 0.038 * effectScale, abs(distanceToPointer - windowRadius))) * shardsMode;
      float decisionRim = (1.0 - smoothstep(0.0, 0.022 * effectScale, abs(coinDistance - windowRadius))) * decisionMode;
      float smokeRim = smoothstep(0.08, 0.48, smokeHole) * (1.0 - smoothstep(0.55, 0.94, smokeHole)) * smokeMode;
      float truthRim = (1.0 - smoothstep(0.0, 0.026 * effectScale, abs(truthDistance - windowRadius))) * truthMode;
      float rim = organicRim + gridRim + waveformRim + radarRim + chainRim
        + bondRim + shardRim + decisionRim + smokeRim + truthRim;
      vec3 color = image * (0.64 + vignette * 0.18);
      color = mix(color, color * uAccent * 1.18, (1.0 - uReveal) * 0.08);
      color += uAccent * rim * (0.08 + uReveal * 0.18);
      float alpha = aperture * (0.68 + uReveal * 0.32);
      gl_FragColor = vec4(color, alpha);
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
  private readonly previewMaterial = new THREE.ShaderMaterial({
    ...destinationPreviewShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly preview: THREE.Mesh;
  private readonly previewRimMaterial = new THREE.MeshBasicMaterial({
    color: 0x82ffd0,
    transparent: true,
    opacity: 0.32,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly previewRim: THREE.Mesh;
  private readonly readyHaloMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb24f,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly readyHalo: THREE.Mesh;
  private readonly shockwaveMaterial = new THREE.MeshBasicMaterial({
    color: 0xff6a12,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  private readonly depthWaveMaterial = new THREE.MeshBasicMaterial({
    color: 0xff9a2b,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  private readonly shockwave: THREE.Mesh;
  private readonly depthWave: THREE.Mesh;
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
  private previewFocus = 0;
  private previewFocusTarget = 0;
  private portalHeat = 0;
  private portalReady = false;
  private readyPulse = 0;
  private previewReveal = 0;
  private previewRadius = 0.035;
  private previewRadiusMax = 0.44;
  private readonly previewPointer = new THREE.Vector2(0.5, 0.5);
  private readonly previewPointerTarget = new THREE.Vector2(0.5, 0.5);
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

    this.preview = new THREE.Mesh(new THREE.CircleGeometry(1.01, 72), this.previewMaterial);
    this.preview.name = 'Destination world lens';
    this.preview.position.z = 1.075;
    this.preview.renderOrder = 160;
    this.preview.visible = false;
    this.previewRim = new THREE.Mesh(new THREE.TorusGeometry(1.035, 0.025, 8, 96), this.previewRimMaterial);
    this.previewRim.name = 'Destination lens fire rim';
    this.previewRim.position.z = 1.082;
    this.previewRim.renderOrder = 161;
    this.previewRim.visible = false;
    this.readyHalo = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.042, 8, 112), this.readyHaloMaterial);
    this.readyHalo.name = 'Stable heated portal halo';
    this.readyHalo.position.z = 1.087;
    this.readyHalo.renderOrder = 159;
    this.readyHalo.visible = false;

    this.shockwave = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.035, 8, 96), this.shockwaveMaterial);
    this.shockwave.name = 'Horizontal forge impact wave';
    this.shockwave.rotation.x = Math.PI / 2;
    this.shockwave.visible = false;
    this.shockwave.renderOrder = 70;
    this.shockwave.frustumCulled = false;
    this.depthWave = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.026, 7, 96), this.depthWaveMaterial);
    this.depthWave.name = 'Horizontal forge impact echo';
    this.depthWave.rotation.x = Math.PI / 2;
    this.depthWave.position.y = 0.035;
    this.depthWave.visible = false;
    this.depthWave.renderOrder = 71;
    this.depthWave.frustumCulled = false;
    this.interactionMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 20, 14),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    this.interactionMesh.name = 'Core interaction volume';
    this.interactionMesh.userData.artifactAction = 'next';
    this.group.add(
      this.light,
      this.shockwave,
      this.depthWave,
      this.fire,
      this.rings,
      this.shards,
      this.wire,
      this.core,
      this.readyHalo,
      this.preview,
      this.previewRim,
      this.interactionMesh,
    );
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
    this.impactStrength = THREE.MathUtils.clamp(strength, 0.35, 2.25);
    this.impactEnergy = Math.max(this.impactEnergy, this.impactStrength);
    this.shockwaveAge = 0;
    this.shockwave.visible = true;
    this.depthWave.visible = true;
    this.shockwave.scale.setScalar(0.52 + this.impactStrength * 0.08);
    this.depthWave.scale.setScalar(0.46 + this.impactStrength * 0.06);
    this.shockwaveMaterial.opacity = Math.min(0.58, 0.11 + this.impactStrength * 0.19);
    this.depthWaveMaterial.opacity = Math.min(0.38, 0.06 + this.impactStrength * 0.13);
  }

  getImpactEnergy(): number {
    return this.impactEnergy;
  }

  getInteractionObject(): THREE.Object3D {
    return this.interactionMesh;
  }

  getPreviewInteractionObject(): THREE.Object3D {
    return this.core;
  }

  getPreviewUv(worldPoint: THREE.Vector3, target: THREE.Vector2): THREE.Vector2 {
    const localPoint = this.group.worldToLocal(worldPoint.clone());
    target.set(
      THREE.MathUtils.clamp(0.5 + localPoint.x / 2.04, 0.08, 0.92),
      THREE.MathUtils.clamp(0.5 + localPoint.y / 2.04, 0.08, 0.92),
    );
    return target;
  }

  setDestinationPreview(texture: THREE.Texture, accent: THREE.Color): void {
    this.previewMaterial.uniforms.tPreview.value = texture;
    this.previewMaterial.uniforms.uAccent.value.copy(accent);
    // The heated core always opens one clean circular portal. Unique reveal
    // shapes belong to the interactive game cards only.
    this.previewMaterial.uniforms.uMode.value = 0;
    this.previewRimMaterial.color.copy(accent).lerp(new THREE.Color(0xff7818), 0.46);
    this.preview.visible = true;
    this.previewRim.visible = true;
  }

  setPreviewFocus(focused: boolean, uv?: THREE.Vector2): void {
    this.previewFocusTarget = focused ? 1 : 0;
    if (uv) this.previewPointerTarget.copy(uv);
  }

  setPortalState(heat: number, ready: boolean): void {
    if (ready && !this.portalReady) this.readyPulse = 1;
    this.portalHeat = THREE.MathUtils.clamp(heat, 0, 1);
    this.portalReady = ready;
  }

  setLayout(mobile: boolean, compactLandscape = false): void {
    const centeredMobile = mobile && !compactLandscape;
    this.layoutPosition.set(
      centeredMobile ? 0 : mobile ? -0.98 : -0.25,
      mobile ? 0.08 : 0.12,
      mobile ? -1.05 : -0.2,
    );
    this.baseScale = centeredMobile ? 0.79 : mobile ? 0.72 : 1;
    this.previewRadiusMax = 0.47;
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

    const energy = 0.72 + journeyIntensity * 1.65 + this.portalHeat * 0.92 + Math.sin(elapsed * 1.4) * 0.08;
    this.impactEnergy = Math.max(0, this.impactEnergy - delta * 1.35);
    this.shockwaveAge += delta;
    const shockDuration = 0.58 + this.impactStrength * 0.18;
    if (this.shockwaveAge < shockDuration) {
      const shockProgress = this.shockwaveAge / shockDuration;
      const shockRadius = 0.52 + this.impactStrength * 0.08 + shockProgress * (1.35 + this.impactStrength * 1.35);
      this.shockwave.scale.setScalar(shockRadius);
      this.shockwave.rotation.z += delta * (0.34 + this.impactStrength * 0.14);
      this.shockwaveMaterial.opacity = Math.pow(1 - shockProgress, 1.72) * Math.min(0.58, 0.11 + this.impactStrength * 0.19);
      const echoProgress = THREE.MathUtils.smoothstep(shockProgress, 0.06, 1);
      this.depthWave.scale.setScalar(shockRadius * (0.72 + echoProgress * 0.34));
      this.depthWave.rotation.z -= delta * (0.4 + this.impactStrength * 0.18);
      this.depthWave.position.y = 0.035 + Math.sin(shockProgress * Math.PI) * 0.08;
      this.depthWaveMaterial.opacity = Math.pow(1 - shockProgress, 1.45) * Math.min(0.38, 0.06 + this.impactStrength * 0.13);
    } else {
      this.shockwave.visible = false;
      this.depthWave.visible = false;
      this.shockwaveMaterial.opacity = 0;
      this.depthWaveMaterial.opacity = 0;
    }
    this.coreMaterial.uniforms.uTime.value = elapsed;
    this.coreMaterial.uniforms.uMode.value = this.mode;
    this.coreMaterial.uniforms.uEnergy.value = energy;
    this.coreMaterial.uniforms.uImpact.value = this.impactEnergy;
    this.coreMaterial.uniforms.uPortalHeat.value = this.portalHeat;
    this.coreMaterial.uniforms.uPointer.value.copy(pointer);
    this.fireMaterial.uniforms.uTime.value = elapsed;
    this.fireMaterial.uniforms.uImpact.value = this.impactEnergy;
    this.fireMaterial.uniforms.uPortalHeat.value = this.portalHeat;
    this.previewFocus = THREE.MathUtils.lerp(
      this.previewFocus,
      this.previewFocusTarget,
      1 - Math.exp(-delta * (this.previewFocusTarget > this.previewFocus ? 8.5 : 4.2)),
    );
    this.previewMaterial.uniforms.uTime.value = elapsed;
    const aperture = THREE.MathUtils.smoothstep(this.portalHeat, 0.12, 0.9);
    this.previewReveal = THREE.MathUtils.lerp(
      this.previewReveal,
      aperture,
      1 - Math.exp(-delta * (aperture > this.previewReveal ? 8.5 : 2.35)),
    );
    const targetRadius = THREE.MathUtils.lerp(0.035, this.previewRadiusMax, aperture);
    this.previewRadius = THREE.MathUtils.lerp(
      this.previewRadius,
      targetRadius,
      1 - Math.exp(-delta * (targetRadius > this.previewRadius ? 9 : 2.15)),
    );
    this.previewMaterial.uniforms.uReveal.value = this.previewReveal * (0.84 + this.previewFocus * 0.16);
    this.previewMaterial.uniforms.uWindowRadius.value = this.previewRadius;
    this.previewMaterial.uniforms.uImpact.value = this.impactEnergy;
    this.previewPointer.lerp(this.previewPointerTarget, 1 - Math.exp(-delta * 20));
    this.previewMaterial.uniforms.uPointer.value.copy(this.previewPointer);
    this.previewRimMaterial.opacity = this.previewReveal * (this.portalReady ? 0.56 : 0.18 + this.portalHeat * 0.2);
    const rimScale = THREE.MathUtils.clamp(this.previewRadius / 0.47, 0.08, 1);
    this.previewRim.scale.setScalar(rimScale);
    this.readyPulse = Math.max(0, this.readyPulse - delta * 0.72);
    const readyBreath = this.portalReady ? 0.5 + Math.sin(elapsed * 4.2) * 0.1 : 0;
    this.readyHalo.visible = this.portalReady || this.readyPulse > 0.01;
    this.readyHaloMaterial.opacity = readyBreath + this.readyPulse * 0.38;
    this.readyHalo.scale.setScalar(1 + Math.sin(elapsed * 3.4) * 0.035 + this.readyPulse * 0.42);
    this.readyHalo.rotation.z -= delta * (this.portalReady ? 0.32 : 0.12);
    this.preview.visible = this.previewReveal > 0.004;
    this.previewRim.visible = this.previewReveal > 0.01;
    this.ringMaterial.emissiveIntensity = 0.82 + energy * 0.58 + this.impactEnergy * 1.45 + this.portalHeat * 1.4;
    this.shardMaterial.emissiveIntensity = 0.27 + energy * 0.24 + this.impactEnergy * 0.72 + this.portalHeat * 0.62;
    this.light.color.copy(this.accent).lerp(this.fireColor, this.impactEnergy * 0.72);
    this.light.intensity = 3.7 + energy * 2.05 + this.impactEnergy * 6.2 + this.portalHeat * 2.2;

    const pulse = 1 + Math.sin(elapsed * 1.8 + this.mode) * 0.035;
    this.group.scale.setScalar(this.baseScale * this.visualScale * pulse);
    this.core.rotation.y += delta * (0.19 + this.mode * 0.008);
    this.core.rotation.x = Math.sin(elapsed * 0.31) * 0.14;
    this.wire.rotation.y -= delta * 0.13;
    this.wire.rotation.z += delta * 0.08;
    this.rings.children.forEach((ring, index) => {
      ring.rotation.z += delta * (index % 2 ? -0.24 : 0.2) * (1 + journeyIntensity * 2.5 + this.portalHeat * 2.8);
      ring.rotation.x += delta * 0.035 * (index + 1);
      ring.scale.setScalar(1 + this.portalHeat * 0.055 + (this.portalReady ? 0.035 : 0));
    });
    this.shards.rotation.y -= delta * (0.12 + journeyIntensity * 0.35);
    this.shards.rotation.z = Math.sin(elapsed * 0.24) * 0.16;
    this.fire.rotation.y += delta * (0.11 + this.impactEnergy * 0.75);
    this.preview.rotation.z = Math.sin(elapsed * 0.38 + this.mode) * 0.012;
    this.previewRim.rotation.z -= delta * (0.08 + this.previewFocus * 0.08 + this.portalHeat * 0.34);
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
    this.previewMaterial.dispose();
    this.previewRimMaterial.dispose();
    this.readyHaloMaterial.dispose();
    this.shockwaveMaterial.dispose();
    this.depthWaveMaterial.dispose();
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
    this.depthWaveMaterial.color.copy(accent).lerp(new THREE.Color(0xffa12b), 0.62);
  }
}
