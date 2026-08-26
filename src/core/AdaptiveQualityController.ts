import * as THREE from 'three';
import type { QualitySettings } from './quality';

/** Runtime quality only moves down during a session, so a weak device does
 * not oscillate between crisp and blurry frames. It keeps interaction smooth
 * while preserving the chosen visual composition. */
export class AdaptiveQualityController {
  private elapsed = 0;
  private frames = 0;
  private scale = 1;
  private cooldown = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly quality: QualitySettings,
    private readonly onScale: (scale: number) => void,
  ) {}

  update(delta: number): void {
    if (document.hidden || delta <= 0 || delta > 0.25) return;
    this.elapsed += delta;
    this.frames += 1;
    this.cooldown = Math.max(0, this.cooldown - delta);
    if (this.elapsed < 2.6) return;
    const fps = this.frames / this.elapsed;
    document.documentElement.dataset.runtimeFps = String(Math.round(fps));
    if (fps < 43 && this.cooldown <= 0 && this.scale > 0.66) {
      this.scale = Math.max(0.66, this.scale - 0.12);
      this.renderer.setPixelRatio(this.quality.pixelRatio * this.scale);
      this.onScale(this.scale);
      this.cooldown = 5;
      document.documentElement.dataset.runtimeQuality = this.scale < 0.78 ? 'economy' : 'balanced';
    }
    this.elapsed = 0;
    this.frames = 0;
  }

  getScale(): number {
    return this.scale;
  }
}
