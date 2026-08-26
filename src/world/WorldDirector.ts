import type { WorldProfile } from '../data/games';
import { SceneDirector, type SceneDirection } from './SceneDirector';

/**
 * One conductor for camera, light, particles and sound. SceneDirector keeps
 * the timing state machine; WorldDirector gives that rhythm the current
 * world's character without duplicating the state logic.
 */
export class WorldDirector extends SceneDirector {
  private profile: WorldProfile | null = null;

  setWorld(profile: WorldProfile): void {
    this.profile = profile;
    document.documentElement.dataset.worldEnvironment = profile.environment;
  }

  override update(
    delta: number,
    elapsed: number,
    portalHeat: number,
    portalReady: boolean,
    traveling: boolean,
  ): SceneDirection {
    const direction = super.update(delta, elapsed, portalHeat, portalReady, traveling);
    if (!this.profile) return direction;
    const lightScale = 0.82 + this.profile.lightEnergy * 0.34;
    const particleScale = 0.76 + this.profile.particleDensity * 1.08;
    return {
      ...direction,
      lightLevel: Math.min(1.35, direction.lightLevel * lightScale),
      particleLevel: Math.min(1.25, direction.particleLevel * particleScale),
      audioEnergy: Math.min(1.2, direction.audioEnergy * (0.9 + this.profile.audioRoot / 900)),
    };
  }
}

export type { SceneDirection, ScenePhase } from './SceneDirector';
