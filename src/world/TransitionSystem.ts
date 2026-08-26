import * as THREE from 'three';
import type { JourneyFrame } from './CameraJourney';

export type JourneyRoute =
  | 'tunnel'
  | 'orbit'
  | 'dive'
  | 'fly-through'
  | 'spiral'
  | 'close-pass'
  | 'rift'
  | 'slingshot'
  | 'ascent'
  | 'recoil'
  | 'relic-forge';

export interface TransitionProfile {
  route: JourneyRoute;
  durationScale: number;
  warp: number;
  twist: number;
  chromatic: number;
  tunnelEnergy: number;
  roll: number;
  collapse: number;
  fovKick: number;
  cameraShake: number;
}

export interface TransitionChoreography {
  postIntensity: number;
  warp: number;
  twist: number;
  chromatic: number;
  worldIntensity: number;
}

const PROFILES: Record<JourneyRoute, TransitionProfile> = {
  orbit: { route: 'orbit', durationScale: 1.04, warp: 0.64, twist: 0.22, chromatic: 0.68, tunnelEnergy: 0.38, roll: 0.08, collapse: 0.76, fovKick: 4.5, cameraShake: 0.08 },
  spiral: { route: 'spiral', durationScale: 1.14, warp: 1.08, twist: 1.2, chromatic: 0.92, tunnelEnergy: 0.94, roll: 0.19, collapse: 1, fovKick: 9, cameraShake: 0.2 },
  'close-pass': { route: 'close-pass', durationScale: 0.94, warp: 0.86, twist: -0.34, chromatic: 0.76, tunnelEnergy: 0.52, roll: 0.13, collapse: 0.82, fovKick: 6.5, cameraShake: 0.28 },
  dive: { route: 'dive', durationScale: 1.08, warp: 0.98, twist: 0.18, chromatic: 0.82, tunnelEnergy: 0.8, roll: 0.12, collapse: 0.94, fovKick: 8, cameraShake: 0.18 },
  'fly-through': { route: 'fly-through', durationScale: 0.9, warp: 1.14, twist: 0.08, chromatic: 1, tunnelEnergy: 1.08, roll: 0.1, collapse: 1.08, fovKick: 13, cameraShake: 0.14 },
  tunnel: { route: 'tunnel', durationScale: 1, warp: 1.18, twist: 0.44, chromatic: 1.08, tunnelEnergy: 1.16, roll: 0.14, collapse: 1.05, fovKick: 11, cameraShake: 0.16 },
  rift: { route: 'rift', durationScale: 0.88, warp: 1.34, twist: -0.18, chromatic: 1.3, tunnelEnergy: 0.42, roll: 0.16, collapse: 1.2, fovKick: 3.5, cameraShake: 0.34 },
  slingshot: { route: 'slingshot', durationScale: 1.12, warp: 0.78, twist: 0.62, chromatic: 0.74, tunnelEnergy: 0.68, roll: 0.21, collapse: 0.9, fovKick: 15, cameraShake: 0.24 },
  recoil: { route: 'recoil', durationScale: 0.96, warp: 1.26, twist: -0.7, chromatic: 1.16, tunnelEnergy: 0.88, roll: 0.18, collapse: 1.16, fovKick: 12, cameraShake: 0.4 },
  ascent: { route: 'ascent', durationScale: 1.18, warp: 0.7, twist: 0.1, chromatic: 0.62, tunnelEnergy: 0.5, roll: 0.06, collapse: 0.72, fovKick: -5, cameraShake: 0.06 },
  'relic-forge': { route: 'relic-forge', durationScale: 1.16, warp: 0.94, twist: 0.18, chromatic: 0.78, tunnelEnergy: 0.74, roll: 0.1, collapse: 1.08, fovKick: 7.5, cameraShake: 0.13 },
};

export class TransitionSystem {
  private profile: TransitionProfile = PROFILES.orbit;
  private mode: 'idle' | 'slide' | 'space' = 'idle';
  private charge = 0;

  begin(route: JourneyRoute, mode: 'slide' | 'space', charge: number): TransitionProfile {
    this.profile = PROFILES[route];
    this.mode = mode;
    this.charge = THREE.MathUtils.clamp(charge, 0, 1);
    document.documentElement.dataset.cameraRoute = mode === 'space' ? this.profile.route : 'slide';
    return this.profile;
  }

  update(frame: JourneyFrame): TransitionChoreography {
    if (!frame.active) {
      this.mode = 'idle';
      return { postIntensity: 0, warp: 0, twist: 0, chromatic: 0, worldIntensity: 0 };
    }
    if (this.mode === 'slide') {
      return {
        postIntensity: frame.intensity * 0.16,
        warp: 0.12,
        twist: 0,
        chromatic: 0.16,
        worldIntensity: frame.intensity * 0.22,
      };
    }
    const envelope = Math.pow(Math.sin(frame.progress * Math.PI), 0.72);
    const chargeBoost = 1 + this.charge * 0.28;
    return {
      postIntensity: Math.max(frame.intensity, envelope * 0.82) * this.profile.warp * chargeBoost,
      warp: this.profile.warp * chargeBoost,
      twist: this.profile.twist * envelope,
      chromatic: this.profile.chromatic * (0.82 + this.charge * 0.32),
      worldIntensity: frame.intensity * this.profile.collapse * chargeBoost,
    };
  }

  getProfile(): TransitionProfile {
    return this.profile;
  }
}
