import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { GameData } from '../data/games';
import type { QualitySettings } from '../core/quality';
import { ApprovedMascot } from './ApprovedMascot';
import { CameraJourney, type CameraAnchor, type JourneyFrame } from './CameraJourney';
import { CoreArtifact } from './CoreArtifact';
import { MouseFluid } from './MouseFluid';
import { SparkSystem } from './SparkSystem';

interface Card3D {
  group: THREE.Group;
  frame: THREE.Mesh;
  cover: THREE.Mesh;
  index: number;
  baseY: number;
}

interface WorldChamber {
  group: THREE.Group;
  portal: THREE.Group;
  satellites: THREE.Group;
  card: Card3D;
}

interface WorldCallbacks {
  onProgress: (progress: number) => void;
  onSelect: (index: number) => void;
  onActivate: (index: number) => void;
  onImpact: () => void;
}

const RING_RADIUS = 27;

const finishShader = {
  uniforms: {
    tDiffuse: { value: null },
    tFluid: { value: null },
    uTime: { value: 0 },
    uStrength: { value: 0.45 },
    uFluidStrength: { value: 1 },
    uTransition: { value: 0 },
    uImpact: { value: 0 },
    uAccent: { value: new THREE.Color(0x82ffd0) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform sampler2D tFluid;
    uniform float uTime;
    uniform float uStrength;
    uniform float uFluidStrength;
    uniform float uTransition;
    uniform float uImpact;
    uniform vec3 uAccent;
    varying vec2 vUv;

    float hash(vec2 point) {
      return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 point) {
      vec2 cell = floor(point);
      vec2 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
        mix(hash(cell + vec2(0.0, 1.0)), hash(cell + 1.0), local.x), local.y);
    }

    void main() {
      vec4 fluid = texture2D(tFluid, vUv);
      vec2 center = vUv - 0.5;
      float edge = smoothstep(0.18, 0.78, length(center));
      float turbulence = noise(vUv * 9.0 + vec2(uTime * 0.28, -uTime * 0.17)) - 0.5;
      vec2 fluidShift = fluid.xy * 0.032 * uFluidStrength;
      vec2 travelShift = vec2(turbulence, sin(vUv.y * 24.0 + uTime * 3.0) * 0.5) * uTransition * 0.045;
      vec2 lensShift = center * 0.0018 * edge * uStrength;
      vec2 sampleUv = clamp(vUv - fluidShift + travelShift, 0.001, 0.999);

      float split = 0.0014 * uStrength + fluid.z * 0.004 + uTransition * 0.006;
      float red = texture2D(tDiffuse, clamp(sampleUv + lensShift + vec2(split, 0.0), 0.001, 0.999)).r;
      float green = texture2D(tDiffuse, sampleUv).g;
      float blue = texture2D(tDiffuse, clamp(sampleUv - lensShift - vec2(split, 0.0), 0.001, 0.999)).b;
      vec3 color = vec3(red, green, blue);
      color += uAccent * fluid.z * 0.075;
      color += uAccent * pow(max(0.0, turbulence + 0.18), 3.0) * uTransition * 0.16;
      color += vec3(1.0, 0.22, 0.025) * uImpact * (0.035 + fluid.z * 0.12);
      float grain = (hash(vUv * 1200.0 + uTime) - 0.5) * 0.017 * uStrength;
      color += grain;
      color *= 1.0 - edge * 0.19;
      color *= 1.0 - uTransition * (0.035 + abs(turbulence) * 0.06);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export class GameWorld {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 140);
  readonly mascot = new ApprovedMascot();
  readonly artifact = new CoreArtifact();
  readonly sparks: SparkSystem;
  private readonly composer: EffectComposer;
  private readonly finishPass: ShaderPass;
  private readonly fluid: MouseFluid;
  private readonly cards: Card3D[] = [];
  private readonly chambers: WorldChamber[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly timer = new THREE.Timer();
  private readonly pointerTarget = new THREE.Vector2();
  private readonly pointerSmooth = new THREE.Vector2();
  private readonly pointerUv = new THREE.Vector2(0.5, 0.5);
  private readonly previousPointerUv = new THREE.Vector2(0.5, 0.5);
  private readonly pointerVelocity = new THREE.Vector2();
  private readonly tempVector = new THREE.Vector3();
  private readonly callbacks: WorldCallbacks;
  private readonly games: GameData[];
  private readonly quality: QualitySettings;
  private journey: CameraJourney | null = null;
  private activeIndex = 0;
  private pendingMascotIndex: number | null = null;
  private mascotRelocated = true;
  private destinationBurstDone = true;
  private lastPointerTime = 0;
  private lastHitRequest = 0;
  private impactCharge = 0;
  private lastJourneyRequest = 0;
  private journeyCharge = 0;
  private mobile = false;
  private compactLandscape = false;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, games: GameData[], quality: QualitySettings, callbacks: WorldCallbacks) {
    this.games = games;
    this.quality = quality;
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality.antialias,
      powerPreference: quality.preset === 'low' ? 'default' : 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setPixelRatio(quality.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color(0x05070c);
    this.scene.fog = new THREE.FogExp2(0x05070c, 0.026);
    this.camera.position.set(0, 0.4, 11.2);
    this.timer.connect(document);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    if (quality.bloom) {
      const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.46, 0.78);
      this.composer.addPass(bloom);
    }
    this.finishPass = new ShaderPass(finishShader);
    this.finishPass.uniforms.uStrength.value = quality.preset === 'low' ? 0.12 : 0.5;
    this.finishPass.uniforms.uFluidStrength.value = quality.preset === 'low' ? 0.56 : quality.preset === 'medium' ? 0.82 : 1;
    this.composer.addPass(this.finishPass);

    this.fluid = new MouseFluid(this.renderer, quality.fluidSize);
    this.finishPass.uniforms.tFluid.value = this.fluid.texture;
    this.sparks = new SparkSystem(quality.sparks);
    this.scene.add(this.sparks.points);
    this.installBaseScene();
    this.resize();
  }

  async initialize(): Promise<void> {
    const loader = new THREE.TextureLoader();
    const textures: THREE.Texture[] = [];
    for (let index = 0; index < this.games.length; index += 1) {
      const texture = await loader.loadAsync(this.games[index].cover);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      textures.push(texture);
      this.callbacks.onProgress((index + 1) / 21);
    }
    await this.mascot.initialize((progress) => this.callbacks.onProgress((10 + progress * 11) / 21));
    textures.forEach((texture, index) => this.createChamber(texture, index));
    this.scene.add(...this.chambers.map((chamber) => chamber.group));
    this.scene.updateMatrixWorld(true);

    this.chambers[0].group.add(this.mascot.group);
    this.artifact.mount(this.chambers[0].group, 0, new THREE.Color(this.games[0].accent));
    this.updateResponsiveLayout();
    this.scene.updateMatrixWorld(true);
    this.journey = new CameraJourney(this.camera, this.getCameraAnchor(0));
    this.finishPass.uniforms.uAccent.value.set(this.games[0].accent);
    this.publishDiagnostics();
    this.animate();
  }

  private installBaseScene(): void {
    const hemisphere = new THREE.HemisphereLight(0xa8cfff, 0x190d0b, 1.55);
    const key = new THREE.DirectionalLight(0xffe7d5, 3.2);
    key.position.set(-8, 12, 9);
    key.castShadow = this.quality.shadows;
    key.shadow.mapSize.set(1024, 1024);
    const rim = new THREE.DirectionalLight(0x4168ff, 2.8);
    rim.position.set(8, 5, -10);
    this.scene.add(hemisphere, key, rim);
    this.createStars();

    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 0.05, 6, 160),
      new THREE.MeshBasicMaterial({ color: 0x1a614f, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending }),
    );
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = -2.35;
    this.scene.add(innerRing);
  }

  private createStars(): void {
    const positions = new Float32Array(this.quality.stars * 3);
    for (let index = 0; index < this.quality.stars; index += 1) {
      const radius = 34 + Math.random() * 46;
      const angle = Math.random() * Math.PI * 2;
      positions[index * 3] = Math.sin(angle) * radius;
      positions[index * 3 + 1] = (Math.random() - 0.45) * 38;
      positions[index * 3 + 2] = Math.cos(angle) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x94d7ff,
      size: 0.04,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
    });
    const stars = new THREE.Points(geometry, material);
    stars.name = 'Orbital 3D star field';
    this.scene.add(stars);
  }

  private createChamber(texture: THREE.Texture, index: number): void {
    const game = this.games[index];
    const accent = new THREE.Color(game.accent);
    const angle = (index / this.games.length) * Math.PI * 2;
    const group = new THREE.Group();
    group.name = `World ${String(index + 1).padStart(2, '0')}: ${game.title}`;
    group.position.set(Math.sin(angle) * RING_RADIUS, Math.sin(index * 1.37) * 0.72, Math.cos(angle) * RING_RADIUS);
    group.rotation.y = angle;

    const floorMaterial = new THREE.MeshPhysicalMaterial({
      color: accent.clone().multiplyScalar(0.055),
      emissive: accent,
      emissiveIntensity: 0.035,
      roughness: 0.58,
      metalness: 0.75,
      clearcoat: 0.35,
    });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(5.9, 6.25, 0.24, 64), floorMaterial);
    floor.position.y = -2.48;
    floor.receiveShadow = true;
    group.add(floor);

    const portal = new THREE.Group();
    portal.position.set(0, 0.05, -1.75);
    const portalMaterial = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.45 + ringIndex * 0.48, 0.028 + ringIndex * 0.008, 7, 96), portalMaterial);
      ring.rotation.z = ringIndex * 0.38 + index * 0.12;
      ring.scale.y = 0.9 + ringIndex * 0.045;
      portal.add(ring);
    }
    const veil = new THREE.Mesh(
      new THREE.CircleGeometry(4.65, 72),
      new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(0.35), transparent: true, opacity: 0.065, depthWrite: false }),
    );
    veil.position.z = -0.06;
    portal.add(veil);
    group.add(portal);

    const pylonMaterial = new THREE.MeshStandardMaterial({
      color: accent.clone().multiplyScalar(0.09),
      emissive: accent,
      emissiveIntensity: 0.09,
      roughness: 0.38,
      metalness: 0.86,
    });
    [-1, 1].forEach((side) => {
      const pylon = new THREE.Mesh(new RoundedBoxGeometry(0.32, 4.7, 0.42, 4, 0.08), pylonMaterial);
      pylon.position.set(side * 4.55, -0.12, -1.28);
      pylon.rotation.z = -side * 0.07;
      pylon.castShadow = true;
      group.add(pylon);
    });

    const satellites = this.createSatellites(index, accent);
    satellites.scale.setScalar(0.68);
    group.add(satellites);
    const dust = this.createChamberDust(accent, index);
    group.add(dust);
    const card = this.createCard(texture, index);
    group.add(card.group);
    this.cards.push(card);
    this.chambers.push({ group, portal, satellites, card });
  }

  private createSatellites(index: number, accent: THREE.Color): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Procedural chamber satellites';
    const variant = index % 5;
    let geometry: THREE.BufferGeometry;
    if (variant === 0) geometry = new THREE.TetrahedronGeometry(0.24, 0);
    else if (variant === 1) geometry = new THREE.OctahedronGeometry(0.22, 0);
    else if (variant === 2) geometry = new THREE.BoxGeometry(0.32, 0.5, 0.18);
    else if (variant === 3) geometry = new THREE.ConeGeometry(0.22, 0.58, 5);
    else geometry = new THREE.TorusGeometry(0.22, 0.055, 6, 18);
    const material = new THREE.MeshStandardMaterial({
      color: accent.clone().multiplyScalar(0.18),
      emissive: accent,
      emissiveIntensity: 0.22,
      metalness: 0.72,
      roughness: 0.3,
    });
    for (let item = 0; item < 12; item += 1) {
      const angle = (item / 12) * Math.PI * 2;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(Math.cos(angle) * (4.05 + (item % 2) * 0.45), Math.sin(angle) * 2.15, -1.15 + Math.sin(item * 1.7) * 0.32);
      mesh.rotation.set(angle * 0.7, angle, -angle * 0.4);
      group.add(mesh);
    }
    return group;
  }

  private createChamberDust(accent: THREE.Color, seed: number): THREE.Points {
    const count = this.quality.preset === 'low' ? 24 : 54;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399 + seed;
      const radius = 2.4 + (index % 9) * 0.31;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = -1.8 + ((index * 17) % count) / count * 4.7;
      positions[index * 3 + 2] = -0.7 + Math.sin(index * 0.83) * 1.2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: accent,
      size: 0.035,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geometry, material);
  }

  private createCard(texture: THREE.Texture, index: number): Card3D {
    const game = this.games[index];
    const accent = new THREE.Color(game.accent);
    const group = new THREE.Group();
    group.name = `Game portal: ${game.title}`;
    group.userData.cardIndex = index;

    const frameMaterial = new THREE.MeshPhysicalMaterial({
      color: accent.clone().multiplyScalar(0.2),
      roughness: 0.24,
      metalness: 0.78,
      clearcoat: 0.82,
      clearcoatRoughness: 0.17,
      emissive: accent,
      emissiveIntensity: 0.38,
    });
    const frame = new THREE.Mesh(new RoundedBoxGeometry(3.58, 3.58, 0.24, 6, 0.13), frameMaterial);
    frame.castShadow = true;
    frame.receiveShadow = true;
    frame.userData.cardIndex = index;

    const image = texture.image as { width: number; height: number };
    const imageAspect = image.width / image.height;
    if (imageAspect > 1) {
      texture.repeat.x = 1 / imageAspect;
      texture.offset.x = (1 - texture.repeat.x) / 2;
    } else if (imageAspect < 1) {
      texture.repeat.y = imageAspect;
      texture.offset.y = (1 - texture.repeat.y) / 2;
    }
    texture.needsUpdate = true;
    const coverMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      toneMapped: false,
    });
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(3.38, 3.38), coverMaterial);
    cover.position.z = 0.126;
    cover.renderOrder = 4;
    cover.userData.cardIndex = index;

    const back = new THREE.Mesh(
      new RoundedBoxGeometry(3.14, 3.14, 0.11, 4, 0.1),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.78, roughness: 0.28 }),
    );
    back.position.z = -0.18;
    group.add(back, frame, cover);
    return { group, frame, cover, index, baseY: 0.08 };
  }

  setActive(index: number, immediate = false): void {
    if (!this.chambers.length || !this.journey) return;
    const normalized = (index + this.chambers.length) % this.chambers.length;
    let difference = normalized - this.activeIndex;
    if (difference > this.chambers.length / 2) difference -= this.chambers.length;
    if (difference < -this.chambers.length / 2) difference += this.chambers.length;
    const direction = difference >= 0 ? 1 : -1;
    const oldAccent = new THREE.Color(this.games[this.activeIndex].accent);
    const nextAccent = new THREE.Color(this.games[normalized].accent);
    if (!immediate) {
      const now = performance.now();
      const interval = this.lastJourneyRequest > 0 ? now - this.lastJourneyRequest : Number.POSITIVE_INFINITY;
      const cadenceBoost = interval < 520 ? 0.25 : interval < 950 ? 0.18 : interval < 1500 ? 0.12 : 0.08;
      this.journeyCharge = THREE.MathUtils.clamp(this.journeyCharge + cadenceBoost, 0, 1);
      this.lastJourneyRequest = now;
    }
    const journeyPower = 0.72 + this.journeyCharge * 1.53;
    this.artifact.getWorldPosition(this.tempVector);
    this.sparks.burst(this.tempVector, oldAccent, 0.3 + this.journeyCharge * 0.3, journeyPower);

    this.activeIndex = normalized;
    const anchor = this.getCameraAnchor(this.activeIndex);
    if (immediate) this.journey.jumpTo(anchor);
    else this.journey.travelTo(anchor, direction);
    this.artifact.beginJourney(this.chambers[this.activeIndex].group, this.activeIndex, nextAccent);
    this.pendingMascotIndex = this.activeIndex;
    this.mascotRelocated = immediate;
    this.destinationBurstDone = immediate;
    if (immediate) this.relocateMascot();
    this.finishPass.uniforms.uAccent.value.copy(nextAccent);
    document.documentElement.dataset.cameraJourney = immediate ? 'arrived' : 'traveling';
    document.documentElement.dataset.journeyCharge = String(Math.round(this.journeyCharge * 100));
    this.publishDiagnostics();
  }

  setPointer(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.pointerUv.set(
      THREE.MathUtils.clamp((clientX - rect.left) / width, 0, 1),
      THREE.MathUtils.clamp(1 - (clientY - rect.top) / height, 0, 1),
    );
    this.pointerTarget.set(this.pointerUv.x - 0.5, 0.5 - this.pointerUv.y);
    const now = performance.now();
    if (this.lastPointerTime > 0) {
      const seconds = Math.max(1 / 240, (now - this.lastPointerTime) / 1000);
      this.pointerVelocity.subVectors(this.pointerUv, this.previousPointerUv).multiplyScalar(0.08 / seconds);
      if (this.pointerVelocity.length() > 0.75) this.pointerVelocity.setLength(0.75);
      this.fluid.setPointer(this.pointerUv, this.pointerVelocity);
    }
    this.previousPointerUv.copy(this.pointerUv);
    this.lastPointerTime = now;
  }

  pick(clientX: number, clientY: number): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([
      this.artifact.getInteractionObject(),
      ...this.cards.map((card) => card.group),
    ], true);
    let hitObject: THREE.Object3D | null = hits[0]?.object ?? null;
    let index: number | undefined;
    while (hitObject) {
      if (hitObject.userData.artifactAction === 'next') {
        this.callbacks.onSelect((this.activeIndex + 1) % this.games.length);
        return true;
      }
      if (typeof hitObject.userData.cardIndex === 'number') {
        index = hitObject.userData.cardIndex as number;
        break;
      }
      hitObject = hitObject.parent;
    }
    if (index === undefined) return false;
    if (index === this.activeIndex) {
      this.callbacks.onActivate(index);
      return true;
    }
    this.callbacks.onSelect(index);
    return true;
  }

  hit(boostCombo = true): void {
    const now = performance.now();
    if (boostCombo) {
      const interval = this.lastHitRequest > 0 ? now - this.lastHitRequest : Number.POSITIVE_INFINITY;
      const cadenceBoost = interval < 320 ? 0.26 : interval < 680 ? 0.2 : interval < 1200 ? 0.14 : 0.1;
      this.impactCharge = THREE.MathUtils.clamp(this.impactCharge + cadenceBoost, 0, 1);
      this.lastHitRequest = now;
    } else {
      this.impactCharge = Math.max(this.impactCharge, 0.12);
    }
    document.documentElement.dataset.hitCharge = String(Math.round(this.impactCharge * 100));
    this.mascot.hit((origin) => {
      const accent = new THREE.Color(this.games[this.activeIndex].accent);
      const strength = 0.72 + this.impactCharge * 1.53;
      const hammerParticles = 0.28 + this.impactCharge * 0.24;
      const coreParticles = 0.42 + this.impactCharge * 0.53;
      this.sparks.burst(origin, new THREE.Color(0xff7a18), hammerParticles, strength);
      this.artifact.impact(strength);
      this.artifact.getWorldPosition(this.tempVector);
      this.sparks.burst(this.tempVector, accent, coreParticles, strength);
      this.callbacks.onImpact();
    });
  }

  resize(): void {
    const width = Math.max(1, innerWidth);
    const height = Math.max(1, innerHeight);
    this.mobile = width <= 900;
    this.compactLandscape = height <= 520 && width > height;
    this.camera.aspect = width / height;
    this.camera.fov = this.mobile ? 43 : 38;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(this.quality.pixelRatio);
    this.composer.setSize(width, height);
    this.updateResponsiveLayout();
    if (this.journey && this.chambers.length) {
      this.scene.updateMatrixWorld(true);
      this.journey.jumpTo(this.getCameraAnchor(this.activeIndex));
      document.documentElement.dataset.cameraJourney = 'arrived';
    }
  }

  private updateResponsiveLayout(): void {
    this.cards.forEach((card) => {
      card.group.position.set(this.mobile ? 0.62 : 2.28, this.mobile ? 0.18 : 0.08, this.mobile ? 0.24 : 0.18);
      const scale = this.mobile ? (innerWidth < 430 ? 0.67 : 0.72) : 0.94;
      card.group.scale.setScalar(scale);
      card.baseY = card.group.position.y;
    });
    this.artifact.setLayout(this.mobile);
    if (this.mascot.group.parent) {
      this.mascot.group.position.set(this.mobile ? -1.34 : -3.48, this.mobile ? -0.74 : -0.7, this.mobile ? 0.68 : 0.58);
      this.mascot.group.scale.setScalar(this.mobile ? (innerWidth < 430 ? 0.49 : 0.54) : 0.78);
    }
  }

  private getCameraAnchor(index: number): CameraAnchor {
    const chamber = this.chambers[index].group;
    chamber.updateWorldMatrix(true, false);
    const cameraDistance = this.compactLandscape ? 10.35 : this.mobile ? 12.8 : 11.2;
    const position = chamber.localToWorld(new THREE.Vector3(0, this.mobile ? 0.55 : 0.42, cameraDistance));
    const target = chamber.localToWorld(new THREE.Vector3(0, this.mobile ? -0.02 : 0.08, 0));
    return { position, target };
  }

  private relocateMascot(): void {
    if (this.pendingMascotIndex === null) return;
    const chamber = this.chambers[this.pendingMascotIndex];
    chamber.group.add(this.mascot.group);
    this.mascot.group.position.set(this.mobile ? -1.34 : -3.48, this.mobile ? -0.74 : -0.7, this.mobile ? 0.68 : 0.58);
    this.mascot.group.scale.setScalar(this.mobile ? (innerWidth < 430 ? 0.49 : 0.54) : 0.78);
    this.mascotRelocated = true;
  }

  private animate = (timestamp?: number): void => {
    if (this.destroyed) return;
    requestAnimationFrame(this.animate);
    this.timer.update(timestamp);
    const delta = Math.min(this.timer.getDelta(), 0.05);
    const elapsed = this.timer.getElapsed();
    this.pointerSmooth.lerp(this.pointerTarget, 1 - Math.exp(-delta * 4.5));
    this.impactCharge = Math.max(0, this.impactCharge - delta * 0.075);
    this.journeyCharge = Math.max(0, this.journeyCharge - delta * 0.06);
    document.documentElement.dataset.hitCharge = String(Math.round(this.impactCharge * 100));
    document.documentElement.dataset.journeyCharge = String(Math.round(this.journeyCharge * 100));

    this.chambers.forEach((chamber, index) => {
      const card = chamber.card;
      card.group.position.y = card.baseY + Math.sin(elapsed * 0.72 + index * 0.9) * 0.055;
      card.group.rotation.y = Math.sin(elapsed * 0.38 + index) * 0.035;
      card.group.rotation.x = Math.sin(elapsed * 0.52 + index * 0.7) * 0.014;
      chamber.portal.rotation.z += delta * (index % 2 ? -0.035 : 0.035);
      chamber.satellites.rotation.z = Math.sin(elapsed * 0.12 + index) * 0.08;
    });

    const frame: JourneyFrame = this.journey
      ? this.journey.update(delta, this.pointerSmooth, this.mobile)
      : { active: false, progress: 1, intensity: 0 };
    if (!this.mascotRelocated && frame.progress >= 0.42) this.relocateMascot();
    if (!this.destinationBurstDone && frame.progress >= 0.58) {
      const journeyPower = 0.72 + this.journeyCharge * 1.53;
      this.artifact.impact(journeyPower);
      this.artifact.getWorldPosition(this.tempVector);
      this.sparks.burst(
        this.tempVector,
        new THREE.Color(this.games[this.activeIndex].accent),
        0.42 + this.journeyCharge * 0.53,
        journeyPower,
      );
      this.destinationBurstDone = true;
    }
    if (!frame.active && frame.progress >= 1) {
      this.pendingMascotIndex = null;
      document.documentElement.dataset.cameraJourney = 'arrived';
    }

    this.artifact.update(delta, elapsed, frame.progress, frame.intensity, this.pointerSmooth);
    this.mascot.update(delta, elapsed);
    this.sparks.update(delta);
    this.fluid.update(delta, this.camera.aspect);
    this.finishPass.uniforms.tFluid.value = this.fluid.texture;
    this.finishPass.uniforms.uTime.value = elapsed;
    this.finishPass.uniforms.uTransition.value = frame.intensity;
    this.finishPass.uniforms.uImpact.value = this.artifact.getImpactEnergy();
    this.composer.render(delta);
  };

  private publishDiagnostics(): void {
    document.documentElement.dataset.threeReady = this.cards.length ? 'true' : 'loading';
    document.documentElement.dataset.threeCamera = this.camera.type;
    document.documentElement.dataset.threeMeshes = String(this.countMeshes());
    document.documentElement.dataset.threeQuality = this.quality.preset;
  }

  private countMeshes(): number {
    let count = 0;
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) count += 1;
    });
    return count;
  }

  getDiagnostics(): Record<string, unknown> {
    const target = this.journey?.getTarget(new THREE.Vector3()) ?? new THREE.Vector3();
    return {
      renderer: this.renderer.constructor.name,
      camera: this.camera.type,
      cameraPosition: this.camera.position.toArray().map((value) => Number(value.toFixed(2))),
      cameraTarget: target.toArray().map((value) => Number(value.toFixed(2))),
      cameraJourney: document.documentElement.dataset.cameraJourney ?? 'loading',
      sceneChildren: this.scene.children.length,
      meshes: this.countMeshes(),
      lights: this.scene.children.filter((child) => child instanceof THREE.Light).length,
      worlds: this.chambers.length,
      cards: this.cards.length,
      activeIndex: this.activeIndex,
      quality: this.quality.preset,
      approvedMascot: 'nine transparent held frames + impact platform',
      artifact: 'procedural morphing metallic core',
      mouseFluid: `ping-pong half-float FBO ${this.quality.fluidSize}x${this.quality.fluidSize}`,
      particles: `${this.quality.sparks} GPU-animated sparks`,
      hitCharge: Number(this.impactCharge.toFixed(2)),
      journeyCharge: Number(this.journeyCharge.toFixed(2)),
      postprocessing: this.quality.bloom ? 'bloom + FBO fluid + journey displacement' : 'FBO fluid + journey displacement',
    };
  }

  dispose(): void {
    this.destroyed = true;
    this.fluid.dispose();
    this.sparks.dispose();
    this.mascot.dispose();
    this.artifact.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          const map = (material as THREE.MeshStandardMaterial).map;
          map?.dispose();
          material.dispose();
        });
      }
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.timer.dispose();
  }
}
