import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { GameData } from '../data/games';
import type { QualitySettings } from '../core/quality';
import { ApprovedMascot } from './ApprovedMascot';
import { SparkSystem } from './SparkSystem';

interface Card3D {
  group: THREE.Group;
  frame: THREE.Mesh;
  cover: THREE.Mesh;
  index: number;
}

interface WorldCallbacks {
  onProgress: (progress: number) => void;
  onSelect: (index: number) => void;
  onActivate: (index: number) => void;
  onImpact: () => void;
}

const finishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uStrength: { value: 0.45 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uStrength;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 center = vUv - 0.5;
      float edge = smoothstep(0.18, 0.82, length(center));
      vec2 shift = center * 0.0015 * edge * uStrength;
      float r = texture2D(tDiffuse, vUv + shift).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - shift).b;
      float grain = (hash(vUv * 1100.0 + uTime) - 0.5) * 0.018 * uStrength;
      vec3 color = vec3(r, g, b) + grain;
      color *= 1.0 - edge * 0.2;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export class GameWorld {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 90);
  readonly mascot = new ApprovedMascot();
  readonly sparks: SparkSystem;
  private readonly composer: EffectComposer;
  private readonly finishPass: ShaderPass;
  private readonly cards: Card3D[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly timer = new THREE.Timer();
  private readonly accentLight = new THREE.PointLight(0x82ffd0, 7, 12, 2);
  private readonly cameraTarget = new THREE.Vector3(0, 0.35, 0);
  private readonly pointerTarget = new THREE.Vector2();
  private readonly pointerSmooth = new THREE.Vector2();
  private readonly callbacks: WorldCallbacks;
  private readonly games: GameData[];
  private readonly quality: QualitySettings;
  private activeIndex = 0;
  private mobile = false;
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
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color(0x080b12);
    this.scene.fog = new THREE.FogExp2(0x080b12, 0.042);
    this.camera.position.set(0, 0.35, 11.2);
    this.timer.connect(document);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    if (quality.bloom) {
      const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.18, 0.3, 0.9);
      this.composer.addPass(bloom);
    }
    this.finishPass = new ShaderPass(finishShader);
    this.finishPass.uniforms.uStrength.value = quality.preset === 'low' ? 0.08 : 0.42;
    this.composer.addPass(this.finishPass);

    this.sparks = new SparkSystem(quality.sparks);
    this.scene.add(this.sparks.points);
    this.installScene();
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
      this.callbacks.onProgress((index + 1) / 20);
    }
    await this.mascot.initialize((progress) => this.callbacks.onProgress((10 + progress * 10) / 20));
    textures.forEach((texture, index) => this.createCard(texture, index));
    this.scene.add(...this.cards.map((card) => card.group));
    this.updateLayout(true);
    this.publishDiagnostics();
    this.animate();
  }

  private installScene(): void {
    const hemisphere = new THREE.HemisphereLight(0xb7d9ff, 0x281815, 2.25);
    const key = new THREE.DirectionalLight(0xffe2cd, 4.4);
    key.position.set(-4, 7, 8);
    key.castShadow = this.quality.shadows;
    key.shadow.mapSize.set(1024, 1024);
    const rim = new THREE.SpotLight(0x4d78ff, 18, 22, Math.PI * 0.2, 0.8, 1.4);
    rim.position.set(5, 5, -3);
    rim.target.position.set(0, 0, 0);
    this.accentLight.position.set(0.3, 0.8, 3.1);
    this.scene.add(hemisphere, key, rim, rim.target, this.accentLight);

    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x07090e, roughness: 0.73, metalness: 0.42 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 28), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.42;
    floor.position.z = -3;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(28, 34, 0x18423a, 0x10151c);
    grid.position.y = -2.4;
    grid.position.z = -3;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.22;
    this.scene.add(grid);

    this.createStars();
    this.mascot.group.position.set(-3.56, -0.66, 0.62);
    this.mascot.group.scale.setScalar(0.82);
    this.scene.add(this.mascot.group);

    const forgeGlow = new THREE.PointLight(0xff5d16, 6.5, 4.5, 2);
    forgeGlow.position.set(-2.15, -1.65, 1.05);
    this.scene.add(forgeGlow);
  }

  private createStars(): void {
    const positions = new Float32Array(this.quality.stars * 3);
    for (let index = 0; index < this.quality.stars; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 35;
      positions[index * 3 + 1] = (Math.random() - 0.32) * 19;
      positions[index * 3 + 2] = -5 - Math.random() * 34;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x93d5ff,
      size: 0.028,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const stars = new THREE.Points(geometry, material);
    stars.name = '3D star field';
    this.scene.add(stars);
  }

  private createCard(texture: THREE.Texture, index: number): void {
    const game = this.games[index];
    const accent = new THREE.Color(game.accent);
    const group = new THREE.Group();
    group.name = `3D card: ${game.title}`;
    group.userData.cardIndex = index;

    const frameMaterial = new THREE.MeshPhysicalMaterial({
      color: accent.clone().multiplyScalar(0.22),
      roughness: 0.27,
      metalness: 0.73,
      clearcoat: 0.72,
      clearcoatRoughness: 0.19,
      emissive: accent,
      emissiveIntensity: 0.16,
    });
    const frame = new THREE.Mesh(new RoundedBoxGeometry(3.62, 3.62, 0.22, 6, 0.13), frameMaterial);
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
    const coverMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.58,
      metalness: 0.04,
      emissive: accent.clone().multiplyScalar(0.08),
      emissiveMap: texture,
      emissiveIntensity: 0.24,
    });
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(3.42, 3.42), coverMaterial);
    cover.position.z = 0.121;
    cover.userData.cardIndex = index;

    const back = new THREE.Mesh(
      new RoundedBoxGeometry(3.08, 3.08, 0.08, 4, 0.1),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.65, roughness: 0.34 }),
    );
    back.position.z = -0.17;
    back.scale.set(0.95, 0.95, 1);

    group.add(back, frame, cover);
    this.cards.push({ group, frame, cover, index });
  }

  setActive(index: number, immediate = false): void {
    this.activeIndex = (index + this.cards.length) % this.cards.length;
    this.updateLayout(immediate);
    this.accentLight.color.set(this.games[this.activeIndex].accent);
    this.publishDiagnostics();
  }

  private relativeOffset(index: number): number {
    let offset = index - this.activeIndex;
    const half = this.games.length / 2;
    if (offset > half) offset -= this.games.length;
    if (offset < -half) offset += this.games.length;
    return offset;
  }

  private updateLayout(immediate = false): void {
    this.cards.forEach((card) => {
      const offset = this.relativeOffset(card.index);
      const active = offset === 0;
      const targetScale = active ? (this.mobile ? 0.72 : 1) : this.mobile ? 0.47 : 0.66;
      const targetX = this.mobile ? offset * 2.08 + 0.35 : offset * 2.48 + 0.12;
      const targetY = active ? (this.mobile ? 0.36 : 0.12) : -0.08 - Math.abs(offset) * 0.15;
      const targetZ = -Math.abs(offset) * (this.mobile ? 1.45 : 1.22) - (active ? 0 : 0.45);
      card.group.userData.targetPosition = new THREE.Vector3(targetX, targetY, targetZ);
      card.group.userData.targetScale = targetScale;
      card.group.userData.targetRotation = -offset * (this.mobile ? 0.26 : 0.34);
      card.group.visible = Math.abs(offset) <= (this.mobile ? 2 : 3);
      if (immediate) {
        card.group.position.copy(card.group.userData.targetPosition as THREE.Vector3);
        card.group.scale.setScalar(targetScale);
        card.group.rotation.y = card.group.userData.targetRotation as number;
      }
      const material = card.frame.material as THREE.MeshPhysicalMaterial;
      material.emissiveIntensity = active ? 0.44 : 0.07;
      (card.cover.material as THREE.MeshStandardMaterial).emissiveIntensity = active ? 0.3 : 0.17;
    });
  }

  setPointer(clientX: number, clientY: number): void {
    this.pointerTarget.set(clientX / innerWidth - 0.5, clientY / innerHeight - 0.5);
  }

  pick(clientX: number, clientY: number): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.cards.map((card) => card.group), true);
    const index = hits.find((hit) => typeof hit.object.userData.cardIndex === 'number')?.object.userData.cardIndex as number | undefined;
    if (index === undefined) return false;
    if (index === this.activeIndex) {
      this.callbacks.onActivate(index);
      return true;
    }
    this.callbacks.onSelect(index);
    return true;
  }

  hit(): void {
    this.mascot.hit((origin) => {
      this.sparks.burst(origin);
      this.callbacks.onImpact();
    });
  }

  resize(): void {
    const width = Math.max(1, innerWidth);
    const height = Math.max(1, innerHeight);
    const wasMobile = this.mobile;
    this.mobile = width <= 900;
    this.camera.aspect = width / height;
    this.camera.fov = this.mobile ? 42 : 38;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(this.quality.pixelRatio);
    this.composer.setSize(width, height);

    if (this.mobile) {
      this.camera.position.z = 12.2;
      this.mascot.group.position.set(-1.08, -0.76, 0.74);
      this.mascot.group.scale.setScalar(width < 430 ? 0.52 : 0.56);
    } else {
      this.camera.position.z = 11.2;
      this.mascot.group.position.set(-3.56, -0.66, 0.62);
      this.mascot.group.scale.setScalar(0.82);
    }

    if (wasMobile !== this.mobile && this.cards.length) this.updateLayout(true);
  }

  private animate = (timestamp?: number): void => {
    if (this.destroyed) return;
    requestAnimationFrame(this.animate);
    this.timer.update(timestamp);
    const delta = Math.min(this.timer.getDelta(), 0.05);
    const elapsed = this.timer.getElapsed();
    this.pointerSmooth.lerp(this.pointerTarget, 1 - Math.exp(-delta * 4));

    this.cards.forEach((card) => {
      const targetPosition = card.group.userData.targetPosition as THREE.Vector3 | undefined;
      if (!targetPosition) return;
      const targetScale = card.group.userData.targetScale as number;
      const targetRotation = card.group.userData.targetRotation as number;
      const damping = 1 - Math.exp(-delta * 5.4);
      card.group.position.lerp(targetPosition, damping);
      const scale = THREE.MathUtils.lerp(card.group.scale.x, targetScale, damping);
      card.group.scale.setScalar(scale);
      card.group.rotation.y = THREE.MathUtils.lerp(card.group.rotation.y, targetRotation, damping);
      card.group.rotation.x = Math.sin(elapsed * 0.72 + card.index) * 0.012;
      card.group.position.y += Math.sin(elapsed * 0.64 + card.index * 0.8) * 0.0008;
    });

    const desiredX = this.pointerSmooth.x * (this.mobile ? 0.16 : 0.48);
    const desiredY = 0.35 - this.pointerSmooth.y * (this.mobile ? 0.1 : 0.3);
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, desiredX, 1 - Math.exp(-delta * 3.5));
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, desiredY, 1 - Math.exp(-delta * 3.5));
    this.camera.lookAt(this.cameraTarget);

    this.mascot.update(delta, elapsed);
    this.sparks.update(delta);
    this.finishPass.uniforms.uTime.value = elapsed;
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
    return {
      renderer: this.renderer.constructor.name,
      camera: this.camera.type,
      sceneChildren: this.scene.children.length,
      meshes: this.countMeshes(),
      lights: this.scene.children.filter((child) => child instanceof THREE.Light).length,
      cards: this.cards.length,
      activeIndex: this.activeIndex,
      quality: this.quality.preset,
      approvedMascot: 'six action frames + recovery + blink',
      postprocessing: this.quality.bloom ? 'bloom + finish shader' : 'finish shader',
    };
  }

  dispose(): void {
    this.destroyed = true;
    this.sparks.dispose();
    this.mascot.dispose();
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
