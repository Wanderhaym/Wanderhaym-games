import * as THREE from 'three';
import cat00Url from '../../assets/mascot/web/cat-00-idle.webp?url';
import cat01Url from '../../assets/mascot/web/cat-01-ready.webp?url';
import cat02Url from '../../assets/mascot/web/cat-02-windup.webp?url';
import cat03Url from '../../assets/mascot/web/cat-03-swing.webp?url';
import cat04Url from '../../assets/mascot/web/cat-04-contact.webp?url';
import cat05Url from '../../assets/mascot/web/cat-05-impact.webp?url';
import recoverUrl from '../../assets/mascot/web/cat-recover.webp?url';
import blinkHalfUrl from '../../assets/mascot/web/cat-blink-half.webp?url';
import blinkClosedUrl from '../../assets/mascot/web/cat-blink.webp?url';
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
  private queuedHits = 0;
  private impactSent = false;
  private onImpact: ImpactCallback | null = null;

  constructor() {
    this.group.name = 'Approved Wanderhaym cat / held-frame WebGL animation';
    this.character.position.set(-0.36, 0.22, 0.16);
    this.platform.position.set(0.56, -1.68, 0);
    this.group.add(this.platform, this.character);
  }

  async initialize(onProgress: (progress: number) => void): Promise<void> {
    const loader = new THREE.TextureLoader();
    const urls = [
      cat00Url, cat01Url, cat02Url, cat03Url, cat04Url, cat05Url,
      recoverUrl, blinkHalfUrl, blinkClosedUrl, idlePlatformUrl, hitPlatformUrl,
    ];
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
      [2.82, 4.08], [4.05, 4.05], [4.05, 4.05],
      [4.05, 4.05], [4.05, 4.05], [2.82, 4.08],
      [2.82, 4.08], [2.82, 4.08], [2.82, 4.08],
    ];
    textures.slice(0, 9).forEach((texture, index) => {
      const [width, height] = frameSizes[index];
      const layer = createLayer(texture, width, height, 0.1 + index * 0.004);
      this.frames.push(layer);
      this.character.add(layer);
    });
    this.showOnly(0);

    this.idlePlatform = createLayer(textures[9], 3.48, 1.77, 0.04);
    this.hitPlatform = createLayer(textures[10], 3.48, 1.77, 0.07);
    this.setLayerOpacity(this.idlePlatform, 1);
    this.setLayerOpacity(this.hitPlatform, 0);
    this.platform.add(this.idlePlatform, this.hitPlatform);
  }

  hit(callback: ImpactCallback): void {
    if (this.frames.length !== 9) return;
    if (this.hitTime >= 0) {
      this.queuedHits = Math.min(5, this.queuedHits + 1);
      return;
    }
    this.hitTime = 0;
    this.impactSent = false;
    this.onImpact = callback;
  }

  update(delta: number, elapsed: number): void {
    if (this.frames.length !== 9 || !this.idlePlatform || !this.hitPlatform) return;
    if (this.hitTime < 0) {
      this.updateBlink(elapsed % 2);
      this.character.position.y = 0.22 + Math.sin(elapsed * 1.6) * 0.018;
      this.character.rotation.z = Math.sin(elapsed * 0.75) * 0.008;
      return;
    }

    this.hitTime += delta * (1 + Math.min(4, this.queuedHits) * 0.16);
    const time = this.hitTime;
    if (time < 0.16) {
      this.setState('prepare');
      this.showStepped(0, 1, time / 0.16);
      this.character.position.y = THREE.MathUtils.lerp(0.22, 0.28, time / 0.16);
    } else if (time < 0.25) {
      this.setState('prepare-hold');
      this.showOnly(1);
    } else if (time < 0.42) {
      this.setState('windup');
      this.showStepped(1, 2, (time - 0.25) / 0.17);
    } else if (time < 0.5) {
      this.setState('windup-hold');
      this.showOnly(2);
    } else if (time < 0.64) {
      this.setState('swing');
      this.showStepped(2, 3, (time - 0.5) / 0.14);
    } else if (time < 0.7) {
      this.setState('swing-hold');
      this.showOnly(3);
    } else if (time < 0.8) {
      this.setState('contact');
      const progress = this.ease((time - 0.7) / 0.1);
      this.showStepped(3, 4, progress);
      this.character.position.y = THREE.MathUtils.lerp(0.28, 0.17, progress);
    } else if (time < 0.86) {
      this.setState('contact-hold');
      this.showOnly(4);
    } else if (time < 0.94) {
      this.setState('impact');
      this.showStepped(4, 5, (time - 0.86) / 0.08);
      if (time >= 0.9) this.triggerImpact();
    } else if (time < 1.12) {
      this.setState('impact-hold');
      this.showOnly(5);
      this.triggerImpact();
    } else if (time < 1.32) {
      this.setState('recover-low');
      const progress = this.ease((time - 1.12) / 0.2);
      this.showStepped(5, 6, progress);
      this.character.position.y = THREE.MathUtils.lerp(0.17, 0.2, progress);
    } else if (time < 1.42) {
      this.setState('recover-hold');
      this.showOnly(6);
    } else if (time < 1.75) {
      this.setState('recover-stand');
      const progress = this.ease((time - 1.42) / 0.33);
      this.showStepped(6, 0, progress);
      this.character.position.y = THREE.MathUtils.lerp(0.2, 0.22, progress);
      this.setLayerOpacity(this.idlePlatform, 1);
      this.setLayerOpacity(this.hitPlatform, 0);
    } else {
      this.character.position.y = 0.22;
      this.character.rotation.z = 0;
      this.showOnly(0);
      this.setLayerOpacity(this.idlePlatform, 1);
      this.setLayerOpacity(this.hitPlatform, 0);
      if (this.queuedHits > 0) {
        this.queuedHits -= 1;
        this.hitTime = 0;
        this.impactSent = false;
        this.setState('queued-hit');
        return;
      }
      this.hitTime = -1;
      this.setState('idle');
      this.onImpact = null;
      return;
    }

    this.character.rotation.z = time < 1.12 ? -Math.sin(Math.min(1, time / 0.94) * Math.PI) * 0.018 : 0;
  }

  private updateBlink(cycle: number): void {
    if (cycle < 1.56) {
      this.setState('idle');
      this.showOnly(0);
    } else if (cycle < 1.68) {
      this.setState('blink-half-close');
      this.showOnly(7);
    } else if (cycle < 1.8) {
      this.setState('blink-close');
      this.showOnly(8);
    } else if (cycle < 1.88) {
      this.setState('blink-closed-hold');
      this.showOnly(8);
    } else if (cycle < 1.96) {
      this.setState('blink-half-open');
      this.showOnly(7);
    } else {
      this.setState('blink-open');
      this.showOnly(0);
    }
  }

  private triggerImpact(): void {
    if (this.impactSent || !this.idlePlatform || !this.hitPlatform) return;
    this.impactSent = true;
    this.setLayerOpacity(this.idlePlatform, 0);
    this.setLayerOpacity(this.hitPlatform, 1);
    this.onImpact?.(this.group.localToWorld(this.impactPosition.clone()));
  }

  private showOnly(index: number): void {
    this.frames.forEach((frame, frameIndex) => this.setLayerOpacity(frame, frameIndex === index ? 1 : 0));
  }

  private showStepped(from: number, to: number, progress: number): void {
    this.showOnly(progress < 0.48 ? from : to);
  }

  private ease(value: number): number {
    return THREE.MathUtils.smoothstep(value, 0, 1);
  }

  private setState(state: string): void {
    document.documentElement.dataset.mascotState = state;
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
