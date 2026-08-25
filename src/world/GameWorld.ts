import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import dominoChaosGameplayUrl from '../../assets/covers/web/domino-chaos-gameplay.webp?url';
import dominoBordersGameplayUrl from '../../assets/covers/web/domino-borders-gameplay.webp?url';
import wanderVoiceGameplayUrl from '../../assets/covers/web/wandervoice-gameplay.webp?url';
import knowMeGameplayUrl from '../../assets/covers/web/know-me-gameplay.webp?url';
import chainGameplayUrl from '../../assets/covers/web/chain-gameplay.webp?url';
import compatibilityGameplayUrl from '../../assets/covers/web/compatibility-gameplay.webp?url';
import ideasGameplayUrl from '../../assets/covers/web/ideas-gameplay.webp?url';
import riskGameplayUrl from '../../assets/covers/web/risk-gameplay.webp?url';
import smokingGameplayUrl from '../../assets/covers/web/smoking-gameplay.webp?url';
import truthGameplayUrl from '../../assets/covers/web/truth-gameplay.webp?url';
import type { GameData } from '../data/games';
import type { QualitySettings } from '../core/quality';
import { ApprovedMascot } from './ApprovedMascot';
import { CameraJourney, type CameraAnchor, type JourneyFrame } from './CameraJourney';
import { CoreArtifact } from './CoreArtifact';
import { JourneyTunnel } from './JourneyTunnel';
import { InteractivePortalCover, type PortalRevealMode } from './InteractivePortalCover';
import { MouseFluid } from './MouseFluid';
import { SparkSystem } from './SparkSystem';
import { TransitionSystem, type JourneyRoute } from './TransitionSystem';
import { GameEnvironmentManager } from './environment/GameEnvironmentManager';

interface Card3D {
  group: THREE.Group;
  back: THREE.Mesh;
  frame: THREE.Mesh;
  cover: THREE.Mesh;
  index: number;
  baseY: number;
}

interface WorldChamber {
  group: THREE.Group;
  portal: THREE.Group;
  satellites: THREE.Group;
  floor: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  floorFx: THREE.Group;
  card: Card3D;
}

interface WorldCallbacks {
  onProgress: (progress: number) => void;
  onSelect: (index: number) => void;
  onJourney: (index: number) => void;
  onActivate: (index: number) => void;
  onImpact: () => void;
  onPortalState: (state: { heat: number; ready: boolean; destination: string; hits: number; requiredHits: number }) => void;
}

const RING_RADIUS = 27;
const MASCOT_PROGRESS_WEIGHT = 11;
const PORTAL_PROGRESS_KEY = 'wanderhaym.portalTeleports.v1';
const PORTAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const ROUTE_SHADER_ID: Record<JourneyRoute, number> = {
  tunnel: 0,
  orbit: 1,
  dive: 2,
  'fly-through': 3,
  spiral: 4,
  'close-pass': 5,
  rift: 6,
  slingshot: 7,
  ascent: 8,
  recoil: 9,
};

const INTERACTIVE_COVER_CONFIG: Record<number, { exposure: number; mode: PortalRevealMode }> = {
  0: { exposure: 0.82, mode: 'bond' },
  1: { exposure: 0.82, mode: 'shards' },
  2: { exposure: 0.82, mode: 'decision' },
  3: { exposure: 0.82, mode: 'smoke' },
  4: { exposure: 0.82, mode: 'chain' },
  5: { exposure: 0.82, mode: 'waveform' },
  6: { exposure: 0.82, mode: 'grid' },
  7: { exposure: 0.82, mode: 'radar' },
  8: { exposure: 0.82, mode: 'organic' },
  9: { exposure: 0.82, mode: 'truth' },
};

const floorShader = {
  uniforms: {
    uTime: { value: 0 },
    uSeed: { value: 0 },
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
    uniform float uTime;
    uniform float uSeed;
    uniform vec3 uAccent;
    varying vec2 vUv;

    void main() {
      vec2 point = (vUv - 0.5) * 2.0;
      float radius = length(point);
      float angle = atan(point.y, point.x);
      float fade = 1.0 - smoothstep(0.12, 1.0, radius);
      float rings = pow(max(0.0, sin(radius * 42.0 - uTime * 1.35 + uSeed)), 14.0);
      float spokes = pow(max(0.0, sin(angle * 12.0 + radius * 5.0 + uTime * 0.32)), 22.0);
      float pulse = 0.055 + (sin(radius * 9.0 - uTime * 0.7 + uSeed) * 0.5 + 0.5) * 0.055;
      float alpha = fade * (pulse + rings * 0.16 + spokes * 0.075) * 0.32;
      vec3 color = uAccent * (0.52 + rings * 1.35 + spokes * 0.72);
      gl_FragColor = vec4(color, alpha);
    }
  `,
};

const finishShader = {
  uniforms: {
    tDiffuse: { value: null },
    tFluid: { value: null },
    uTime: { value: 0 },
    uStrength: { value: 0.45 },
    uFluidStrength: { value: 1 },
    uTransition: { value: 0 },
    uImpact: { value: 0 },
    uWarp: { value: 1 },
    uTwist: { value: 0 },
    uChromatic: { value: 1 },
    uRoute: { value: -1 },
    uJourneyProgress: { value: 1 },
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
    uniform float uWarp;
    uniform float uTwist;
    uniform float uChromatic;
    uniform float uRoute;
    uniform float uJourneyProgress;
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

    mat2 rotate2d(float angle) {
      float sine = sin(angle);
      float cosine = cos(angle);
      return mat2(cosine, -sine, sine, cosine);
    }

    void main() {
      vec4 fluid = texture2D(tFluid, vUv);
      vec2 center = vUv - 0.5;
      float journeyEnvelope = sin(clamp(uJourneyProgress, 0.0, 1.0) * 3.14159265)
        * clamp(uTransition, 0.0, 1.0);
      vec2 routeCenter = center;

      // Every world owns a recognisable optical movement. These transforms are
      // deliberately transient: they vanish completely after the camera lands.
      if (uRoute > 0.5 && uRoute < 1.5) {
        routeCenter = rotate2d(journeyEnvelope * 0.16) * routeCenter;
        routeCenter.x += sin(uJourneyProgress * 3.14159265) * 0.022;
      } else if (uRoute > 1.5 && uRoute < 2.5) {
        routeCenter.y += journeyEnvelope * (0.035 + abs(center.x) * 0.025);
        routeCenter.x *= 1.0 - journeyEnvelope * 0.035;
      } else if (uRoute > 2.5 && uRoute < 3.5) {
        routeCenter *= 1.0 - journeyEnvelope * 0.105;
      } else if (uRoute > 3.5 && uRoute < 4.5) {
        routeCenter = rotate2d(journeyEnvelope * (0.28 + length(center) * 0.46)) * routeCenter;
      } else if (uRoute > 4.5 && uRoute < 5.5) {
        routeCenter.x += sign(center.y + 0.0001) * journeyEnvelope * 0.02;
        routeCenter.y *= 1.0 + journeyEnvelope * 0.045;
      } else if (uRoute > 5.5 && uRoute < 6.5) {
        float tearSide = sign(center.y + sin(center.x * 21.0 + uTime * 1.7) * 0.035);
        routeCenter.x += tearSide * journeyEnvelope * 0.034;
        routeCenter.y *= 1.0 + journeyEnvelope * 0.07;
      } else if (uRoute > 6.5 && uRoute < 7.5) {
        routeCenter.x += (center.y * center.y - 0.08) * journeyEnvelope * 0.42;
        routeCenter = rotate2d(-journeyEnvelope * 0.13) * routeCenter;
      } else if (uRoute > 7.5 && uRoute < 8.5) {
        routeCenter.y -= journeyEnvelope * 0.055;
        routeCenter.x *= 1.0 + journeyEnvelope * 0.035;
      } else if (uRoute > 8.5) {
        float recoilPulse = sin(uJourneyProgress * 18.8495559) * (1.0 - uJourneyProgress);
        routeCenter *= 1.0 + recoilPulse * journeyEnvelope * 0.075;
        routeCenter.x += recoilPulse * journeyEnvelope * 0.018;
      } else {
        routeCenter *= 1.0 - journeyEnvelope * 0.065;
      }
      float edge = smoothstep(0.18, 0.78, length(center));
      float twistEnvelope = 1.0 - smoothstep(0.04, 0.76, length(center));
      vec2 warpedCenter = rotate2d(uTwist * uTransition * twistEnvelope) * routeCenter;
      vec2 routeUv = warpedCenter + 0.5;
      float turbulence = noise(routeUv * 9.0 + vec2(uTime * 0.28, -uTime * 0.17)) - 0.5;
      float radius = length(center);
      float angle = atan(warpedCenter.y, warpedCenter.x);
      float radialPulse = sin(radius * 74.0 - uTime * 12.0 + turbulence * 5.0);
      float starBands = pow(max(0.0, sin(angle * 19.0 + radius * 34.0 - uTime * 7.0)), 12.0);
      float routeSignature = 0.0;
      if (uRoute > 5.5 && uRoute < 6.5) {
        routeSignature = pow(max(0.0, 1.0 - abs(center.y + turbulence * 0.035) * 15.0), 7.0);
      } else if (uRoute > 6.5 && uRoute < 7.5) {
        float slingArc = abs(center.y + center.x * center.x * 1.4 - 0.15);
        routeSignature = pow(max(0.0, 1.0 - slingArc * 9.0), 9.0);
      } else if (uRoute > 7.5 && uRoute < 8.5) {
        routeSignature = pow(max(0.0, 1.0 - abs(center.x + turbulence * 0.025) * 13.0), 11.0);
      } else if (uRoute > 8.5) {
        routeSignature = pow(max(0.0, sin(radius * 52.0 - uJourneyProgress * 34.0)), 18.0);
      }
      vec2 fluidShift = fluid.xy * 0.032 * uFluidStrength;
      vec2 radialShift = normalize(warpedCenter + vec2(0.0001)) * (0.016 + radialPulse * 0.008) * uTransition * uWarp;
      vec2 travelShift = vec2(turbulence, sin(routeUv.y * 24.0 + uTime * 3.0) * 0.5) * uTransition * 0.034 * uWarp;
      vec2 lensShift = center * 0.0018 * edge * uStrength;
      vec2 sampleUv = clamp(routeUv - fluidShift + travelShift + radialShift, 0.001, 0.999);

      float split = (0.0014 * uStrength + fluid.z * 0.004 + uTransition * 0.006) * (0.72 + uChromatic * 0.42);
      float red = texture2D(tDiffuse, clamp(sampleUv + lensShift + vec2(split, 0.0), 0.001, 0.999)).r;
      float green = texture2D(tDiffuse, sampleUv).g;
      float blue = texture2D(tDiffuse, clamp(sampleUv - lensShift - vec2(split, 0.0), 0.001, 0.999)).b;
      vec3 color = vec3(red, green, blue);
      color += uAccent * fluid.z * 0.075;
      color += uAccent * pow(max(0.0, turbulence + 0.18), 3.0) * uTransition * 0.24;
      color += mix(uAccent, vec3(1.0, 0.48, 0.12), 0.35) * starBands * smoothstep(0.08, 0.66, radius) * uTransition * 0.42;
      color += mix(uAccent, vec3(1.0), 0.34) * routeSignature * journeyEnvelope * 0.38;
      color += vec3(1.0, 0.22, 0.025) * uImpact * (0.035 + fluid.z * 0.12);
      float grain = (hash(vUv * 1200.0 + uTime) - 0.5) * 0.017 * uStrength;
      color += grain;
      color *= 1.0 - edge * 0.19;
      color *= 1.0 - uTransition * (0.16 + abs(turbulence) * 0.11);
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
  private readonly tunnel: JourneyTunnel;
  private readonly environments: GameEnvironmentManager;
  private readonly transitions = new TransitionSystem();
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
  private readonly artifactPreviewUv = new THREE.Vector2(0.5, 0.5);
  private readonly tempVector = new THREE.Vector3();
  private readonly viewerVector = new THREE.Vector3();
  private readonly callbacks: WorldCallbacks;
  private readonly games: GameData[];
  private readonly coverTextures: THREE.Texture[] = [];
  private readonly gameplayTextures = new Map<number, THREE.Texture>();
  private readonly quality: QualitySettings;
  private journey: CameraJourney | null = null;
  private readonly interactiveCovers = new Map<number, InteractivePortalCover>();
  private pointerSeen = false;
  private activeIndex = 0;
  private pendingMascotIndex: number | null = null;
  private mascotRelocated = true;
  private destinationBurstDone = true;
  private lastPointerTime = 0;
  private lastHitRequest = 0;
  private impactCharge = 0;
  private queuedImpactPower = 0.42;
  private lastJourneyRequest = 0;
  private journeyCharge = 0;
  private portalHeat = 0;
  private portalReady = false;
  private portalHits = 0;
  private portalRequiredHits = 4;
  private localPortalTeleports = 0;
  private lastLocalPortalTeleport = 0;
  private portalDestinationIndex = 1;
  private lastPortalHitTime = 0;
  private publishedPortalPercent = -1;
  private publishedPortalReady = false;
  private publishedPortalDestination = -1;
  private interactionLocked = false;
  private portalTeleports = 0;
  private mobile = false;
  private compactLandscape = false;
  private destroyed = false;
  private lastGpuDiagnostic = -1;

  constructor(canvas: HTMLCanvasElement, games: GameData[], quality: QualitySettings, callbacks: WorldCallbacks) {
    this.games = games;
    this.quality = quality;
    this.callbacks = callbacks;
    this.readLocalPortalProgress();
    this.portalRequiredHits = 4 + this.localPortalTeleports;
    this.environments = new GameEnvironmentManager(this.scene, quality);
    this.tunnel = new JourneyTunnel(quality.preset === 'low' ? 150 : quality.preset === 'medium' ? 260 : 380);
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
    this.camera.add(this.tunnel.group);
    this.scene.add(this.camera);
    this.timer.connect(document);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    if (quality.bloom) {
      const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.34, 0.86);
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
    const gameplaySources = [
      compatibilityGameplayUrl,
      ideasGameplayUrl,
      riskGameplayUrl,
      smokingGameplayUrl,
      chainGameplayUrl,
      wanderVoiceGameplayUrl,
      dominoBordersGameplayUrl,
      knowMeGameplayUrl,
      dominoChaosGameplayUrl,
      truthGameplayUrl,
    ];
    const totalProgressWeight = this.games.length + gameplaySources.length + MASCOT_PROGRESS_WEIGHT;
    const textures: THREE.Texture[] = [];
    for (let index = 0; index < this.games.length; index += 1) {
      const texture = await loader.loadAsync(this.games[index].cover);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      textures.push(texture);
      this.coverTextures.push(texture);
      this.callbacks.onProgress((index + 1) / totalProgressWeight);
    }
    for (let index = 0; index < gameplaySources.length; index += 1) {
      const gameplayTexture = await loader.loadAsync(gameplaySources[index]);
      gameplayTexture.colorSpace = THREE.SRGBColorSpace;
      gameplayTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.gameplayTextures.set(index, gameplayTexture);
      this.callbacks.onProgress((this.games.length + index + 1) / totalProgressWeight);
    }
    await this.mascot.initialize((progress) => this.callbacks.onProgress(
      (this.games.length + gameplaySources.length + progress * MASCOT_PROGRESS_WEIGHT) / totalProgressWeight,
    ));
    textures.forEach((texture, index) => this.createChamber(texture, index, this.gameplayTextures.get(index)));
    this.scene.add(...this.chambers.map((chamber) => chamber.group));
    this.updateCardDepthLayers();
    this.scene.updateMatrixWorld(true);

    this.chambers[0].group.add(this.mascot.group);
    this.artifact.mount(this.chambers[0].group, 0, new THREE.Color(this.games[0].accent));
    this.selectRandomPortalDestination();
    this.updateArtifactDestinationPreview();
    this.artifact.setPortalState(0, false);
    this.publishPortalState(true);
    this.environments.initialize(this.chambers[0].group, 0, this.games[0]);
    this.updateResponsiveLayout();
    this.scene.updateMatrixWorld(true);
    this.journey = new CameraJourney(this.camera, this.getCameraAnchor(0));
    this.tunnel.setAccent(new THREE.Color(this.games[0].accent));
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
      size: 0.028,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    const stars = new THREE.Points(geometry, material);
    stars.name = 'Orbital 3D star field';
    this.scene.add(stars);
  }

  private createChamber(texture: THREE.Texture, index: number, gameplayTexture?: THREE.Texture): void {
    const game = this.games[index];
    const accent = new THREE.Color(game.accent);
    const boundariesWorld = index === 6;
    const angle = (index / this.games.length) * Math.PI * 2;
    const group = new THREE.Group();
    group.name = `World ${String(index + 1).padStart(2, '0')}: ${game.title}`;
    group.position.set(Math.sin(angle) * RING_RADIUS, Math.sin(index * 1.37) * 0.72, Math.cos(angle) * RING_RADIUS);
    group.rotation.y = angle;

    const floorMaterial = new THREE.ShaderMaterial({
      ...floorShader,
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: index * 0.73 },
        uAccent: { value: accent.clone() },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6.45, 96), floorMaterial);
    floor.name = 'Transparent forge energy floor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.37;
    floor.renderOrder = 1;

    const floorFx = new THREE.Group();
    floorFx.name = 'Lower portal continuation rings';
    const floorRingMaterial = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: boundariesWorld ? 0.04 : 0.055,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let ringIndex = 0; ringIndex < 1; ringIndex += 1) {
      const floorRing = new THREE.Mesh(
        new THREE.TorusGeometry(2.15 + ringIndex * 1.18, 0.018 + ringIndex * 0.006, 6, 112),
        floorRingMaterial,
      );
      floorRing.rotation.x = Math.PI / 2;
      floorRing.position.y = -2.34 + ringIndex * 0.008;
      floorRing.scale.z = 0.78 + ringIndex * 0.035;
      floorFx.add(floorRing);
    }
    group.add(floor, floorFx);

    const portal = new THREE.Group();
    portal.position.set(0, 0.05, -1.75);
    const portalMaterial = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: boundariesWorld ? 0.055 : 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let ringIndex = 0; ringIndex < 1; ringIndex += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4 + ringIndex * 0.52, 0.026 + ringIndex * 0.007, 7, 112), portalMaterial);
      ring.rotation.z = ringIndex * 0.38 + index * 0.12;
      ring.scale.y = 0.9 + ringIndex * 0.045;
      portal.add(ring);
    }
    const veil = new THREE.Mesh(
      new THREE.CircleGeometry(5.65, 80),
      new THREE.MeshBasicMaterial({
        color: accent.clone().multiplyScalar(0.35),
        transparent: true,
        opacity: boundariesWorld ? 0.008 : 0.012,
        depthWrite: false,
      }),
    );
    veil.position.z = -0.06;
    portal.add(veil);
    group.add(portal);

    const pylonMaterial = new THREE.MeshStandardMaterial({
      color: accent.clone().multiplyScalar(0.09),
      emissive: accent,
      emissiveIntensity: boundariesWorld ? 0.025 : 0.038,
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
    const card = this.createCard(texture, index, gameplayTexture);
    group.add(card.group);
    this.cards.push(card);
    this.chambers.push({ group, portal, satellites, floor, floorFx, card });
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
      emissiveIntensity: 0.08,
      metalness: 0.72,
      roughness: 0.3,
      transparent: true,
      opacity: 0.34,
    });
    const itemCount = 3;
    for (let item = 0; item < itemCount; item += 1) {
      const angle = (item / itemCount) * Math.PI * 2;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(Math.cos(angle) * (4.05 + (item % 2) * 0.45), Math.sin(angle) * 2.15, -1.15 + Math.sin(item * 1.7) * 0.32);
      mesh.rotation.set(angle * 0.7, angle, -angle * 0.4);
      group.add(mesh);
    }
    return group;
  }

  private createChamberDust(accent: THREE.Color, seed: number): THREE.Points {
    const count = this.quality.preset === 'low' ? 4 : 8;
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
      size: 0.023,
      transparent: true,
      opacity: seed === 6 ? 0.075 : 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geometry, material);
  }

  private createCard(texture: THREE.Texture, index: number, gameplayTexture?: THREE.Texture): Card3D {
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
    let coverMaterial: THREE.Material;
    if (gameplayTexture) {
      const revealConfig = INTERACTIVE_COVER_CONFIG[index] ?? { exposure: 0.82, mode: 'organic' as const };
      const interactiveCover = new InteractivePortalCover(
        texture,
        gameplayTexture,
        accent,
        revealConfig.exposure,
        revealConfig.mode,
      );
      this.interactiveCovers.set(index, interactiveCover);
      coverMaterial = interactiveCover.material;
    } else {
      coverMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        toneMapped: false,
      });
    }
    coverMaterial.depthWrite = true;
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(3.38, 3.38), coverMaterial);
    cover.position.z = 0.126;
    cover.renderOrder = 2;
    cover.userData.cardIndex = index;

    const backMaterial = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 0.78,
      roughness: 0.28,
    });
    const back = new THREE.Mesh(
      new RoundedBoxGeometry(3.14, 3.14, 0.11, 4, 0.1),
      backMaterial,
    );
    back.position.z = -0.18;
    back.renderOrder = 0;
    group.add(back, frame, cover);
    return { group, back, frame, cover, index, baseY: 0.08 };
  }

  setActive(index: number, immediate = false, transition: 'slide' | 'space' = 'slide'): void {
    if (!this.chambers.length || !this.journey) return;
    this.clearPointerInteraction();
    this.interactionLocked = !immediate;
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
    const journeyPower = 0.42 + this.journeyCharge * 1.65;
    const transitionProfile = this.transitions.begin(this.games[normalized].journeyRoute, transition, this.journeyCharge);
    this.artifact.getWorldPosition(this.tempVector);
    this.sparks.burst(
      this.tempVector,
      oldAccent,
      0.07 + this.journeyCharge * 0.22,
      journeyPower,
      this.getViewerDirection(this.tempVector),
      'transition',
    );

    this.activeIndex = normalized;
    this.resetPortalGame();
    this.updateCardDepthLayers();
    this.updateArtifactDestinationPreview();
    const anchor = this.getCameraAnchor(this.activeIndex);
    if (immediate) this.journey.jumpTo(anchor);
    else if (transition === 'space') this.journey.travelTo(anchor, direction, transitionProfile);
    else this.journey.slideTo(anchor, direction);
    this.artifact.beginJourney(this.chambers[this.activeIndex].group, this.activeIndex, nextAccent);
    this.environments.transitionTo(
      this.chambers[this.activeIndex].group,
      this.activeIndex,
      this.games[this.activeIndex],
      immediate,
      transition,
    );
    this.tunnel.setAccent(nextAccent);
    this.tunnel.setProfile(transitionProfile);
    this.pendingMascotIndex = this.activeIndex;
    this.mascotRelocated = immediate;
    // A slide already receives its single wave from the mascot hit. The
    // destination pulse belongs only to the separate journey through space.
    this.destinationBurstDone = immediate || transition === 'slide';
    if (immediate) this.relocateMascot();
    this.finishPass.uniforms.uAccent.value.copy(nextAccent);
    document.documentElement.dataset.cameraJourney = immediate ? 'arrived' : 'traveling';
    document.documentElement.dataset.cameraTransition = immediate ? 'idle' : transition;
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
    this.pointer.set(this.pointerUv.x * 2 - 1, this.pointerUv.y * 2 - 1);
    this.pointerSeen = true;
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

  clearPointerInteraction(): void {
    this.pointerSeen = false;
    this.artifact.setPreviewFocus(false);
    this.interactiveCovers.forEach((cover) => cover.setTouch(null));
  }

  touchInteractiveCover(clientX: number, clientY: number): boolean {
    const interactiveCover = this.interactiveCovers.get(this.activeIndex);
    const card = this.cards[this.activeIndex];
    if (!interactiveCover || !card) return false;
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(card.cover, false)[0];
    if (!hit?.uv) return false;
    interactiveCover.setTouch(hit.uv);
    return true;
  }

  touchArtifactPreview(clientX: number, clientY: number): boolean {
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.artifact.getPreviewInteractionObject(), false)[0];
    if (!hit) return false;
    this.artifact.setPreviewFocus(true, this.artifact.getPreviewUv(hit.point, this.artifactPreviewUv));
    return true;
  }

  pick(clientX: number, clientY: number): boolean {
    if (this.interactionLocked) return true;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // The portal card can overlap the core in portrait layouts. Test the
    // core's exact interaction volume first so a visible sphere click never
    // gets stolen by the card sitting a little closer to the camera.
    const artifactHit = this.raycaster.intersectObject(this.artifact.getInteractionObject(), true)[0];
    if (artifactHit) {
      if (this.portalReady) {
        const destination = this.portalDestinationIndex;
        this.portalTeleports += 1;
        document.documentElement.dataset.portalTeleports = String(this.portalTeleports);
        this.localPortalTeleports += 1;
        this.lastLocalPortalTeleport = Date.now();
        this.writeLocalPortalTeleports();
        this.portalRequiredHits = 4 + this.localPortalTeleports;
        this.journeyCharge = Math.max(this.journeyCharge, this.portalHeat);
        this.portalHeat = 0;
        this.portalReady = false;
        this.portalHits = 0;
        this.lastPortalHitTime = 0;
        this.artifact.setPortalState(0, false);
        this.publishPortalState(true);
        this.callbacks.onJourney(destination);
      } else {
        this.hit();
      }
      return true;
    }
    const hits = this.raycaster.intersectObjects(this.cards.map((card) => card.group), true);
    let hitObject: THREE.Object3D | null = hits[0]?.object ?? null;
    let index: number | undefined;
    while (hitObject) {
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
    if (this.interactionLocked && boostCombo) return;
    const now = performance.now();
    if (boostCombo) {
      this.refreshLocalPortalProgress();
      const interval = this.lastHitRequest > 0 ? now - this.lastHitRequest : Number.POSITIVE_INFINITY;
      const cadenceBoost = interval < 320 ? 0.26 : interval < 680 ? 0.2 : interval < 1200 ? 0.14 : 0.1;
      this.impactCharge = THREE.MathUtils.clamp(this.impactCharge + cadenceBoost, 0, 1);
      this.portalHits = Math.min(this.portalRequiredHits, this.portalHits + 1);
      this.portalHeat = this.portalHits / this.portalRequiredHits;
      this.portalReady = this.portalHits >= this.portalRequiredHits;
      this.lastHitRequest = now;
      this.lastPortalHitTime = now;
      this.artifact.setPortalState(this.portalHeat, this.portalReady);
      this.publishPortalState();
    } else {
      this.impactCharge = Math.max(this.impactCharge, 0.12);
    }
    document.documentElement.dataset.hitCharge = String(Math.round(this.impactCharge * 100));
    this.queuedImpactPower = Math.max(this.queuedImpactPower, 0.42 + this.impactCharge * 1.65);
    this.mascot.hit((origin) => {
      const accent = new THREE.Color(this.games[this.activeIndex].accent);
      const strength = Math.max(0.42 + this.impactCharge * 1.65, this.queuedImpactPower);
      const hammerParticles = 0.055 + this.impactCharge * 0.2;
      const coreParticles = 0.08 + this.impactCharge * 0.34;
      this.sparks.burst(
        origin,
        new THREE.Color(0xff7a18),
        hammerParticles,
        strength,
        this.getViewerDirection(origin),
        'hammer',
      );
      this.artifact.impact(strength);
      this.environments.impact(strength);
      this.artifact.getWorldPosition(this.tempVector);
      this.sparks.burst(
        this.tempVector,
        accent,
        coreParticles,
        strength,
        this.getViewerDirection(this.tempVector),
        'wave',
      );
      this.queuedImpactPower = Math.max(0.42, this.queuedImpactPower * 0.94);
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
    const portraitMobile = this.mobile && !this.compactLandscape;
    this.cards.forEach((card) => {
      card.group.position.set(
        portraitMobile ? 0 : this.mobile ? 0.62 : 2.28,
        portraitMobile ? 2.8 : this.mobile ? 0.18 : 0.08,
        this.mobile ? 0.24 : 0.18,
      );
      const scale = portraitMobile
        ? (innerWidth < 430 ? 0.71 : 0.76)
        : this.mobile ? (innerWidth < 430 ? 0.67 : 0.72) : 0.94;
      card.group.scale.setScalar(scale);
      card.frame.scale.set(portraitMobile ? 1.2 : 1, portraitMobile ? 0.75 : 1, 1);
      card.cover.scale.set(portraitMobile ? 1.23 : 1, portraitMobile ? 0.734 : 1, 1);
      card.back.scale.set(portraitMobile ? 1.25 : 1, portraitMobile ? 0.73 : 1, 1);
      this.interactiveCovers.get(card.index)?.setDisplayAspect(portraitMobile ? 4.15 / 2.48 : 1);
      card.baseY = card.group.position.y;
    });
    this.chambers.forEach((chamber) => {
      chamber.floor.position.set(portraitMobile ? 0.15 : 0, portraitMobile ? -3.3 : -2.37, 0);
      chamber.floorFx.position.set(portraitMobile ? 0.15 : 0, portraitMobile ? -0.93 : 0, 0);
    });
    this.artifact.setLayout(this.mobile, this.compactLandscape);
    this.environments.setMobile(this.mobile);
    if (this.mascot.group.parent) {
      this.mascot.group.position.set(
        portraitMobile ? -0.82 : this.mobile ? -1.34 : -3.48,
        portraitMobile ? -2.05 : this.mobile ? -0.74 : -0.7,
        this.mobile ? 0.68 : 0.58,
      );
      this.mascot.group.scale.setScalar(
        portraitMobile ? (innerWidth < 430 ? 0.76 : 0.82) : this.mobile ? (innerWidth < 430 ? 0.49 : 0.54) : 0.78,
      );
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
    const portraitMobile = this.mobile && !this.compactLandscape;
    this.mascot.group.position.set(
      portraitMobile ? -0.82 : this.mobile ? -1.34 : -3.48,
      portraitMobile ? -2.05 : this.mobile ? -0.74 : -0.7,
      this.mobile ? 0.68 : 0.58,
    );
    this.mascot.group.scale.setScalar(
      portraitMobile ? (innerWidth < 430 ? 0.76 : 0.82) : this.mobile ? (innerWidth < 430 ? 0.49 : 0.54) : 0.78,
    );
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
    const portalIdle = this.lastPortalHitTime > 0 ? performance.now() - this.lastPortalHitTime : Number.POSITIVE_INFINITY;
    if (portalIdle > 1800) {
      this.portalHeat = Math.max(0, this.portalHeat - delta * 0.2);
      if (this.portalReady && this.portalHeat < 0.78) this.portalReady = false;
      if (!this.portalReady) {
        this.portalHits = Math.min(
          this.portalHits,
          Math.max(0, Math.floor(this.portalHeat * this.portalRequiredHits + 0.001)),
        );
      }
    }
    this.artifact.setPortalState(this.portalHeat, this.portalReady);
    this.publishPortalState();
    document.documentElement.dataset.hitCharge = String(Math.round(this.impactCharge * 100));
    document.documentElement.dataset.journeyCharge = String(Math.round(this.journeyCharge * 100));

    this.chambers.forEach((chamber, index) => {
      const card = chamber.card;
      card.group.position.y = card.baseY + Math.sin(elapsed * 0.72 + index * 0.9) * 0.055;
      card.group.rotation.y = Math.sin(elapsed * 0.38 + index) * 0.035;
      card.group.rotation.x = Math.sin(elapsed * 0.52 + index * 0.7) * 0.014;
      chamber.portal.rotation.z += delta * (index % 2 ? -0.035 : 0.035);
      chamber.satellites.rotation.z = Math.sin(elapsed * 0.12 + index) * 0.08;
      chamber.floor.material.uniforms.uTime.value = elapsed;
      chamber.floorFx.rotation.y += delta * (index % 2 ? -0.018 : 0.018);
    });

    this.updateInteractiveCover(delta, elapsed);

    const frame: JourneyFrame = this.journey
      ? this.journey.update(delta, this.pointerSmooth, this.mobile)
      : { active: false, progress: 1, intensity: 0, mode: 'idle', route: 'none' };
    const transitionFrame = this.transitions.update(frame);
    if (!this.mascotRelocated && frame.progress >= 0.42) this.relocateMascot();
    if (!this.destinationBurstDone && frame.progress >= 0.58) {
      const journeyPower = 0.42 + this.journeyCharge * 1.65;
      this.artifact.impact(journeyPower);
      this.artifact.getWorldPosition(this.tempVector);
      this.sparks.burst(
        this.tempVector,
        new THREE.Color(this.games[this.activeIndex].accent),
        0.08 + this.journeyCharge * 0.34,
        journeyPower,
        this.getViewerDirection(this.tempVector),
        'wave',
      );
      this.destinationBurstDone = true;
    }
    if (!frame.active && frame.progress >= 1) {
      this.pendingMascotIndex = null;
      this.interactionLocked = false;
      document.documentElement.dataset.cameraJourney = 'arrived';
    }

    const worldIntensity = transitionFrame.worldIntensity;
    this.environments.update(delta, elapsed, frame, this.pointerSmooth);
    this.artifact.update(delta, elapsed, frame.progress, worldIntensity, this.pointerSmooth);
    this.tunnel.update(elapsed, frame);
    this.mascot.update(delta, elapsed);
    this.sparks.update(delta);
    this.fluid.update(delta, this.camera.aspect);
    this.finishPass.uniforms.tFluid.value = this.fluid.texture;
    this.finishPass.uniforms.uTime.value = elapsed;
    this.finishPass.uniforms.uTransition.value = transitionFrame.postIntensity;
    this.finishPass.uniforms.uWarp.value = transitionFrame.warp;
    this.finishPass.uniforms.uTwist.value = transitionFrame.twist;
    this.finishPass.uniforms.uChromatic.value = transitionFrame.chromatic;
    this.finishPass.uniforms.uRoute.value = frame.route === 'none' ? -1 : ROUTE_SHADER_ID[frame.route];
    this.finishPass.uniforms.uJourneyProgress.value = frame.progress;
    this.finishPass.uniforms.uImpact.value = this.artifact.getImpactEnergy();
    this.composer.render(delta);
    if (elapsed - this.lastGpuDiagnostic >= 1) {
      this.lastGpuDiagnostic = elapsed;
      document.documentElement.dataset.threeGeometries = String(this.renderer.info.memory.geometries);
      document.documentElement.dataset.threeTextures = String(this.renderer.info.memory.textures);
      document.documentElement.dataset.threeDrawCalls = String(this.renderer.info.render.calls);
    }
  };

  private publishDiagnostics(): void {
    document.documentElement.dataset.threeReady = this.cards.length ? 'true' : 'loading';
    document.documentElement.dataset.threeCamera = this.camera.type;
    document.documentElement.dataset.threeMeshes = String(this.countMeshes());
    document.documentElement.dataset.threeQuality = this.quality.preset;
  }

  private getViewerDirection(origin: THREE.Vector3): THREE.Vector3 {
    this.camera.getWorldPosition(this.viewerVector);
    return this.viewerVector.sub(origin).normalize();
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
      portalHeat: Number(this.portalHeat.toFixed(2)),
      portalReady: this.portalReady,
      portalHits: this.portalHits,
      portalRequiredHits: this.portalRequiredHits,
      localPortalTeleports: this.localPortalTeleports,
      portalDestination: this.games[this.portalDestinationIndex].title,
      portalTeleports: this.portalTeleports,
      environment: this.environments.getActiveKind(),
      cameraRoute: document.documentElement.dataset.cameraRoute ?? 'none',
      gpuMemory: { ...this.renderer.info.memory },
      drawCalls: this.renderer.info.render.calls,
      postprocessing: this.quality.bloom ? 'bloom + FBO fluid + journey displacement' : 'FBO fluid + journey displacement',
    };
  }

  dispose(): void {
    this.destroyed = true;
    this.fluid.dispose();
    this.tunnel.dispose();
    this.environments.dispose();
    this.interactiveCovers.forEach((cover) => cover.dispose());
    this.interactiveCovers.clear();
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

  private updateInteractiveCover(delta: number, elapsed: number): void {
    let artifactFocused = false;
    if (this.pointerSeen) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const artifactHit = this.raycaster.intersectObject(this.artifact.getPreviewInteractionObject(), false)[0];
      artifactFocused = Boolean(artifactHit);
      if (artifactHit) {
        this.artifact.getPreviewUv(artifactHit.point, this.artifactPreviewUv);
        this.artifact.setPreviewFocus(true, this.artifactPreviewUv);
      }
    }
    if (!artifactFocused) this.artifact.setPreviewFocus(false);
    if (!this.interactiveCovers.size) return;
    const activeCover = this.interactiveCovers.get(this.activeIndex);
    let activeUv: THREE.Vector2 | null = null;
    if (activeCover && this.pointerSeen && this.cards[this.activeIndex]) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObject(this.cards[this.activeIndex].cover, false)[0];
      activeUv = hit?.uv ?? null;
    }
    this.interactiveCovers.forEach((cover, index) => {
      cover.setTouch(index === this.activeIndex ? activeUv : null);
      cover.update(delta, elapsed);
    });
  }

  private updateArtifactDestinationPreview(): void {
    if (!this.coverTextures.length) return;
    const destinationIndex = this.portalDestinationIndex;
    // The heated portal previews the same authored cover the visitor sees on
    // the game's card. Gameplay screenshots remain exclusive to card reveals.
    const texture = this.coverTextures[destinationIndex];
    if (!texture) return;
    this.artifact.setDestinationPreview(
      texture,
      new THREE.Color(this.games[destinationIndex].accent),
    );
    document.documentElement.dataset.coreDestination = this.games[destinationIndex].title;
  }

  private resetPortalGame(): void {
    this.portalHeat = 0;
    this.portalReady = false;
    this.portalHits = 0;
    this.lastPortalHitTime = 0;
    this.selectRandomPortalDestination();
    this.artifact.setPortalState(0, false);
    this.publishPortalState(true);
  }

  private selectRandomPortalDestination(): void {
    if (this.games.length <= 1) {
      this.portalDestinationIndex = this.activeIndex;
      return;
    }
    const previous = this.portalDestinationIndex;
    let destination = this.activeIndex;
    for (let attempt = 0; attempt < 5 && destination === this.activeIndex; attempt += 1) {
      destination = Math.floor(Math.random() * this.games.length);
    }
    if (destination === this.activeIndex) destination = (this.activeIndex + 1) % this.games.length;
    if (destination === previous && this.games.length > 2) {
      destination = (destination + 1) % this.games.length;
      if (destination === this.activeIndex) destination = (destination + 1) % this.games.length;
    }
    this.portalDestinationIndex = destination;
  }

  private publishPortalState(force = false): void {
    const percent = Math.round(this.portalHeat * 100);
    document.documentElement.dataset.portalHeat = String(percent);
    document.documentElement.dataset.portalReady = String(this.portalReady);
    if (!force
      && percent === this.publishedPortalPercent
      && this.portalReady === this.publishedPortalReady
      && this.portalDestinationIndex === this.publishedPortalDestination) return;
    this.publishedPortalPercent = percent;
    this.publishedPortalReady = this.portalReady;
    this.publishedPortalDestination = this.portalDestinationIndex;
    this.callbacks.onPortalState({
      heat: this.portalHeat,
      ready: this.portalReady,
      destination: this.games[this.portalDestinationIndex].title,
      hits: this.portalHits,
      requiredHits: this.portalRequiredHits,
    });
  }

  private readLocalPortalProgress(): void {
    try {
      const raw = localStorage.getItem(PORTAL_PROGRESS_KEY);
      if (!raw) return;
      const legacyValue = Number(raw);
      if (Number.isFinite(legacyValue)) {
        this.localPortalTeleports = Math.max(0, Math.floor(legacyValue));
        this.lastLocalPortalTeleport = Date.now();
        return;
      }
      const stored = JSON.parse(raw) as { teleports?: unknown; lastTeleportAt?: unknown };
      const teleports = Number(stored.teleports);
      const lastTeleportAt = Number(stored.lastTeleportAt);
      if (Number.isFinite(teleports)) this.localPortalTeleports = Math.max(0, Math.floor(teleports));
      if (Number.isFinite(lastTeleportAt)) this.lastLocalPortalTeleport = Math.max(0, Math.floor(lastTeleportAt));
      this.refreshLocalPortalProgress();
    } catch {
      this.localPortalTeleports = 0;
      this.lastLocalPortalTeleport = 0;
    }
  }

  private writeLocalPortalTeleports(): void {
    try {
      localStorage.setItem(PORTAL_PROGRESS_KEY, JSON.stringify({
        teleports: this.localPortalTeleports,
        lastTeleportAt: this.lastLocalPortalTeleport,
      }));
    } catch {
      // Private browsing can disable persistent storage; the in-memory level
      // still works for the current visit.
    }
  }

  private refreshLocalPortalProgress(): void {
    if (this.lastLocalPortalTeleport <= 0 || Date.now() - this.lastLocalPortalTeleport < PORTAL_COOLDOWN_MS) return;
    this.localPortalTeleports = 0;
    this.lastLocalPortalTeleport = 0;
    this.portalRequiredHits = 4;
    this.portalHits = 0;
    this.portalHeat = 0;
    this.portalReady = false;
    try {
      localStorage.removeItem(PORTAL_PROGRESS_KEY);
    } catch {
      // The in-memory reset is enough when persistent storage is unavailable.
    }
  }


  private updateCardDepthLayers(): void {
    this.cards.forEach((card, index) => {
      const active = index === this.activeIndex;
      const layers = [card.back, card.frame, card.cover];
      layers.forEach((mesh, layer) => {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
          material.depthTest = !active;
          material.depthWrite = true;
        });
        // The active game card is the foreground window of the composition.
        // Core rings, fire, sparks and portal effects must stay behind it.
        mesh.renderOrder = active ? 200 + layer : layer;
      });
    });
  }
}
