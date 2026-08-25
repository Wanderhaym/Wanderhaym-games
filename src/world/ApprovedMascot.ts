import * as THREE from 'three';
import cat00Url from '../../assets/mascot/web/cat-00-idle.webp?url';
import cat01Url from '../../assets/mascot/web/cat-01-ready.webp?url';
import cat02Url from '../../assets/mascot/web/cat-02-windup.webp?url';
import cat03Url from '../../assets/mascot/web/cat-03-swing.webp?url';
import cat04Url from '../../assets/mascot/web/cat-04-contact.webp?url';
import cat05Url from '../../assets/mascot/web/cat-05-impact.webp?url';
import recoverUrl from '../../assets/mascot/web/cat-recover.webp?url';
import blinkUrl from '../../assets/mascot/web/cat-blink.webp?url';
import idlePlatformUrl from '../../assets/mascot/web/platform-idle.webp?url';
import hitPlatformUrl from '../../assets/mascot/web/platform-hit.webp?url';

type ImpactCallback = (worldPosition: THREE.Vector3) => void;

function createLayer(texture: THREE.Texture, width: number, height: number, z: number): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    alphaTest: 0.01,
    depthWrite: false,
    toneMapped: false,
  });
  const layer = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  layer.position.z = z;
  layer.visible = false;
  layer.renderOrder = 10;
  return layer;
}

export class ApprovedMascot {
  readonly group = new THREE.Group();
  readonly impactPosition = new THREE.Vector3(0.68, -0.91, 0.42);
  private readonly character = new THREE.Group();
  private readonly platform = new THREE.Group();
  private readonly frames: THREE.Mesh[] = [];
  private idlePlatform: THREE.Mesh | null = null;
  private hitPlatform: THREE.Mesh | null = null;
  private hitTime = -1;
  private impactSent = false;
  private onImpact: ImpactCallback | null = null;

  constructor() {
    this.group.name = 'Approved Wanderhaym cat / six-frame WebGL animation';
    this.character.position.set(-0.36, 0.22, 0.16);
    this.platform.position.set(0.56, -1.68, 0);
    this.group.add(this.platform, this.character);
  }

  async initialize(onProgress: (progress: number) => void): Promise<void> {
    const loader = new THREE.TextureLoader();
    const urls = [cat00Url, cat01Url, cat02Url, cat03Url, cat04Url, cat05Url, recoverUrl, blinkUrl, idlePlatformUrl, hitPlatformUrl];
    const textures: THREE.Texture[] = [];
    for (let index = 0; index < urls.length; index += 1) {
      const texture = await loader.loadAsync(urls[index]);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      textures.push(texture);
      onProgress((index + 1) / urls.length);
    }

    const frameSizes: Array<[number, number]> = [
      [2.82, 4.06], [4.05, 4.05], [4.05, 4.05],
      [4.05, 4.05], [4.05, 4.05], [2.82, 4.07],
      [2.82, 4.08], [2.82, 4.07],
    ];
    textures.slice(0, 8).forEach((texture, index) => {
      const [width, height] = frameSizes[index];
      const layer = createLayer(texture, width, height, 0.1 + index * 0.004);
      this.frames.push(layer);
      this.character.add(layer);
    });
    this.showCalm(0);

    this.idlePlatform = createLayer(textures[8], 3.48, 1.77, 0.04);
    this.hitPlatform = createLayer(textures[9], 3.48, 1.77, 0.07);
    this.setLayerOpacity(this.idlePlatform, 1);
    this.setLayerOpacity(this.hitPlatform, 0);
    this.platform.add(this.idlePlatform, this.hitPlatform);
  }

  hit(callback: ImpactCallback): void {
    if (this.hitTime >= 0 || this.frames.length !== 8) return;
    this.hitTime = 0;
    this.impactSent = false;
    this.onImpact = callback;
  }

  update(delta: number, elapsed: number): void {
    if (this.frames.length !== 8 || !this.idlePlatform || !this.hitPlatform) return;
    if (this.hitTime < 0) {
      const cycle = elapsed % 2;
      let blink = 0;
      if (cycle >= 1.72 && cycle < 1.8) blink = THREE.MathUtils.smoothstep((cycle - 1.72) / 0.08, 0, 1);
      else if (cycle >= 1.8 && cycle < 1.9) blink = 1;
      else if (cycle >= 1.9) blink = 1 - THREE.MathUtils.smoothstep((cycle - 1.9) / 0.1, 0, 1);
      document.documentElement.dataset.mascotState = blink > 0.45 ? 'blink' : 'idle';
      this.showCalm(Math.max(0, blink));
      this.character.position.y = 0.22 + Math.sin(elapsed * 1.6) * 0.018;
      this.character.rotation.z = Math.sin(elapsed * 0.75) * 0.008;
      return;
    }

    this.hitTime += delta;
    const time = this.hitTime;
    let framePosition = 0;
    if (time < 0.12) {
      document.documentElement.dataset.mascotState = 'prepare';
      framePosition = THREE.MathUtils.mapLinear(time, 0, 0.12, 0, 1);
      this.character.position.y = THREE.MathUtils.lerp(0.22, 0.28, time / 0.12);
    } else if (time < 0.25) {
      document.documentElement.dataset.mascotState = 'windup';
      framePosition = THREE.MathUtils.mapLinear(time, 0.12, 0.25, 1, 2);
    } else if (time < 0.36) {
      document.documentElement.dataset.mascotState = 'swing';
      framePosition = THREE.MathUtils.mapLinear(time, 0.25, 0.36, 2, 3);
    } else if (time < 0.45) {
      document.documentElement.dataset.mascotState = 'contact';
      framePosition = THREE.MathUtils.mapLinear(time, 0.36, 0.45, 3, 4);
      this.character.position.y = THREE.MathUtils.lerp(0.28, 0.16, (time - 0.36) / 0.09);
    } else if (time < 0.62) {
      document.documentElement.dataset.mascotState = 'impact';
      framePosition = Math.min(5, THREE.MathUtils.mapLinear(time, 0.45, 0.51, 4, 5));
      if (!this.impactSent) {
        this.impactSent = true;
        this.setLayerOpacity(this.idlePlatform, 0);
        this.setLayerOpacity(this.hitPlatform, 1);
        this.onImpact?.(this.group.localToWorld(this.impactPosition.clone()));
      }
    } else if (time < 0.76) {
      document.documentElement.dataset.mascotState = 'recover-low';
      const recovery = THREE.MathUtils.smoothstep((time - 0.62) / 0.14, 0, 1);
      this.showTransition(5, 6, recovery);
      this.character.position.y = THREE.MathUtils.lerp(0.16, 0.19, recovery);
      return;
    } else if (time < 1.04) {
      document.documentElement.dataset.mascotState = 'recover-stand';
      const recovery = THREE.MathUtils.smoothstep((time - 0.76) / 0.28, 0, 1);
      this.showTransition(6, 0, recovery);
      this.character.position.y = THREE.MathUtils.lerp(0.19, 0.22, recovery);
      this.setLayerOpacity(this.idlePlatform, 1);
      this.setLayerOpacity(this.hitPlatform, 0);
      return;
    } else {
      this.hitTime = -1;
      document.documentElement.dataset.mascotState = 'idle';
      this.character.position.y = 0.22;
      this.character.rotation.z = 0;
      this.character.scale.setScalar(1);
      this.showCalm(0);
      this.setLayerOpacity(this.idlePlatform, 1);
      this.setLayerOpacity(this.hitPlatform, 0);
      this.onImpact = null;
      return;
    }

    this.showAttackFrame(framePosition);
    this.character.rotation.z = -Math.sin(Math.min(1, time / 0.62) * Math.PI) * 0.018;
  }

  private showAttackFrame(position: number): void {
    const lower = Math.max(0, Math.min(5, Math.floor(position)));
    const upper = Math.max(0, Math.min(5, Math.ceil(position)));
    const blend = THREE.MathUtils.smoothstep(position - lower, 0, 1);
    this.frames.forEach((frame, index) => {
      let opacity = 0;
      if (index === lower) opacity = lower === upper ? 1 : 1 - blend;
      if (index === upper) opacity = lower === upper ? 1 : blend;
      this.setLayerOpacity(frame, opacity);
    });
  }

  private showTransition(from: number, to: number, progress: number): void {
    this.frames.forEach((frame, index) => {
      const opacity = index === from ? 1 - progress : index === to ? progress : 0;
      this.setLayerOpacity(frame, opacity);
    });
  }

  private showCalm(blink: number): void {
    this.frames.forEach((frame, index) => {
      const opacity = index === 0 ? 1 - blink : index === 7 ? blink : 0;
      this.setLayerOpacity(frame, opacity);
    });
  }

  private setLayerOpacity(layer: THREE.Mesh, opacity: number): void {
    (layer.material as THREE.MeshBasicMaterial).opacity = opacity;
    layer.visible = opacity > 0.001;
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const material = object.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
    });
  }
}
