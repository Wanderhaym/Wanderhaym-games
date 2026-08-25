import * as THREE from 'three';
import type { JourneyRoute, TransitionProfile } from './TransitionSystem';

export interface CameraAnchor {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export interface JourneyFrame {
  active: boolean;
  progress: number;
  intensity: number;
  mode: JourneyMode;
  route: JourneyRoute | 'none';
}

export type JourneyMode = 'idle' | 'slide' | 'space';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

function easeInOutQuint(value: number): number {
  return value < 0.5
    ? 16 * value * value * value * value * value
    : 1 - Math.pow(-2 * value + 2, 5) / 2;
}

export class CameraJourney {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly target = new THREE.Vector3();
  private readonly startPosition = new THREE.Vector3();
  private readonly endPosition = new THREE.Vector3();
  private readonly startTarget = new THREE.Vector3();
  private readonly endTarget = new THREE.Vector3();
  private readonly controlA = new THREE.Vector3();
  private readonly controlB = new THREE.Vector3();
  private readonly targetControlA = new THREE.Vector3();
  private readonly targetControlB = new THREE.Vector3();
  private readonly basePosition = new THREE.Vector3();
  private readonly baseTarget = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly parallax = new THREE.Vector3();
  private readonly routeOffset = new THREE.Vector3();
  private readonly cameraShake = new THREE.Vector3();
  private readonly travelAxis = new THREE.Vector3();
  private readonly travelSide = new THREE.Vector3();
  private elapsed = 0;
  private duration = 0;
  private traveling = false;
  private direction = 1;
  private mode: JourneyMode = 'idle';
  private route: JourneyRoute | 'none' = 'none';
  private routeProfile: TransitionProfile | null = null;
  private restFov: number;

  constructor(camera: THREE.PerspectiveCamera, initial: CameraAnchor) {
    this.camera = camera;
    this.restFov = camera.fov;
    this.jumpTo(initial);
  }

  jumpTo(anchor: CameraAnchor): void {
    this.traveling = false;
    this.mode = 'idle';
    this.route = 'none';
    this.routeProfile = null;
    this.elapsed = 0;
    this.duration = 0;
    this.basePosition.copy(anchor.position);
    this.baseTarget.copy(anchor.target);
    this.target.copy(anchor.target);
    this.camera.position.copy(anchor.position);
    this.restFov = this.camera.fov;
    this.camera.up.copy(WORLD_UP);
    this.camera.lookAt(this.target);
  }

  travelTo(anchor: CameraAnchor, direction: number, profile: TransitionProfile): void {
    this.restFov = this.camera.fov;
    this.mode = 'space';
    this.route = profile.route;
    this.routeProfile = profile;
    this.direction = direction >= 0 ? 1 : -1;
    this.startPosition.copy(this.basePosition);
    this.startTarget.copy(this.baseTarget);
    this.endPosition.copy(anchor.position);
    this.endTarget.copy(anchor.target);

    const distance = this.startPosition.distanceTo(this.endPosition);
    const startInward = this.startPosition.clone().setY(0).normalize().multiplyScalar(-1);
    const endInward = this.endPosition.clone().setY(0).normalize().multiplyScalar(-1);
    const dive = THREE.MathUtils.clamp(25 + distance * 0.28, 27, 34);
    const lift = THREE.MathUtils.clamp(distance * 0.07, 1.8, 4.2);
    const startOutward = startInward.clone().multiplyScalar(-1);
    const endOutward = endInward.clone().multiplyScalar(-1);
    const startTangent = new THREE.Vector3(-startOutward.z, 0, startOutward.x).multiplyScalar(this.direction);
    const endTangent = new THREE.Vector3(-endOutward.z, 0, endOutward.x).multiplyScalar(this.direction);
    this.travelAxis.subVectors(this.endPosition, this.startPosition).normalize();
    this.travelSide.crossVectors(this.travelAxis, WORLD_UP).normalize();
    if (this.travelSide.lengthSq() < 0.001) this.travelSide.set(this.direction, 0, 0);

    if (profile.route === 'orbit') {
      const arc = THREE.MathUtils.clamp(distance * 0.48, 12, 24);
      this.controlA.copy(this.startPosition).addScaledVector(startTangent, arc).addScaledVector(startOutward, 4.8);
      this.controlB.copy(this.endPosition).addScaledVector(endTangent, -arc).addScaledVector(endOutward, 3.4);
      this.controlA.y += lift * 0.7;
      this.controlB.y -= lift * 0.24;
    } else if (profile.route === 'dive') {
      this.controlA.copy(this.startPosition).addScaledVector(startInward, dive * 0.74);
      this.controlB.copy(this.endPosition).addScaledVector(endInward, dive * 0.82);
      this.controlA.y -= 7.2 + lift;
      this.controlB.y += 2.4 + lift * 0.35;
    } else if (profile.route === 'fly-through') {
      this.controlA.copy(this.startPosition).addScaledVector(startInward, dive * 1.12).addScaledVector(startTangent, 2.5);
      this.controlB.copy(this.endPosition).addScaledVector(endInward, dive * 1.08).addScaledVector(endTangent, -2.2);
      this.controlA.y += lift * 0.25;
      this.controlB.y -= lift * 0.18;
    } else if (profile.route === 'spiral') {
      this.controlA.copy(this.startPosition).addScaledVector(startInward, dive * 0.96).addScaledVector(startTangent, 5.5);
      this.controlB.copy(this.endPosition).addScaledVector(endInward, dive * 0.96).addScaledVector(endTangent, -5.5);
      this.controlA.y += 5.5 * this.direction;
      this.controlB.y -= 4.2 * this.direction;
    } else if (profile.route === 'close-pass') {
      this.controlA.copy(this.startPosition).addScaledVector(startInward, dive * 0.72).addScaledVector(startTangent, 7.2);
      this.controlB.copy(this.endPosition).addScaledVector(endInward, dive * 0.68).addScaledVector(endTangent, -6.4);
      this.controlA.y += lift * 0.46;
      this.controlB.y -= lift * 0.36;
    } else if (profile.route === 'rift') {
      this.controlA.copy(this.startPosition).lerp(this.endPosition, 0.24)
        .addScaledVector(this.travelSide, 11.5 * this.direction);
      this.controlB.copy(this.startPosition).lerp(this.endPosition, 0.76)
        .addScaledVector(this.travelSide, -9.5 * this.direction);
      this.controlA.y += 2.4;
      this.controlB.y -= 2.1;
    } else if (profile.route === 'slingshot') {
      this.controlA.copy(this.startPosition).addScaledVector(startOutward, 12.5).addScaledVector(startTangent, -7.5);
      this.controlB.copy(this.endPosition).addScaledVector(endInward, dive * 1.18).addScaledVector(endTangent, -8.5);
      this.controlA.y += lift * 1.15;
      this.controlB.y -= lift * 0.28;
    } else if (profile.route === 'ascent') {
      this.controlA.copy(this.startPosition).lerp(this.endPosition, 0.26).addScaledVector(WORLD_UP, 18 + lift);
      this.controlB.copy(this.startPosition).lerp(this.endPosition, 0.72).addScaledVector(WORLD_UP, 14 + lift * 0.7);
      this.controlA.addScaledVector(startTangent, 2.6);
      this.controlB.addScaledVector(endTangent, -2.2);
    } else if (profile.route === 'recoil') {
      this.controlA.copy(this.startPosition).addScaledVector(startOutward, 10.5).addScaledVector(startTangent, 3.5);
      this.controlB.copy(this.endPosition).addScaledVector(endInward, dive * 1.28).addScaledVector(endTangent, 3.2);
      this.controlA.y -= 2.8;
      this.controlB.y += 1.4;
    } else {
      this.controlA.copy(this.startPosition).addScaledVector(startInward, dive);
      this.controlB.copy(this.endPosition).addScaledVector(endInward, dive);
      this.controlA.y += lift * this.direction;
      this.controlB.y -= lift * this.direction * 0.55;
    }

    // During the middle phase the camera looks into the centre of the world,
    // instead of tracking two cards sideways across the screen.
    if (profile.route === 'orbit') {
      this.targetControlA.copy(this.startTarget).lerp(this.endTarget, 0.38).addScaledVector(startTangent, 2.4);
      this.targetControlB.copy(this.startTarget).lerp(this.endTarget, 0.7).addScaledVector(endTangent, -1.8);
    } else if (profile.route === 'close-pass') {
      this.targetControlA.set(this.direction * 4.8, 0.8, -1.2);
      this.targetControlB.set(-this.direction * 3.6, -0.35, 1.4);
    } else if (profile.route === 'rift') {
      this.targetControlA.set(this.direction * 6.2, 1.1, -2.2);
      this.targetControlB.set(-this.direction * 5.4, -0.8, 2.1);
    } else if (profile.route === 'slingshot') {
      this.targetControlA.copy(this.startTarget).addScaledVector(startOutward, 4.2);
      this.targetControlB.set(0, 0.3, 0);
    } else if (profile.route === 'ascent') {
      this.targetControlA.set(0, -2.4, 0);
      this.targetControlB.set(0, 1.6, 0);
    } else if (profile.route === 'recoil') {
      this.targetControlA.copy(this.startTarget).addScaledVector(startOutward, 3.5);
      this.targetControlB.set(-this.direction * 2.8, 0.2, 0.6);
    } else {
      this.targetControlA.set(0, this.direction * (profile.route === 'spiral' ? 1.8 : 0.7), 0);
      this.targetControlB.set(0, -this.direction * (profile.route === 'dive' ? 1.2 : 0.35), 0);
    }
    this.elapsed = 0;
    this.duration = THREE.MathUtils.clamp((2.35 + distance * 0.025) * profile.durationScale, 2.35, 3.65);
    this.traveling = true;
  }

  slideTo(anchor: CameraAnchor, direction: number): void {
    this.restFov = this.camera.fov;
    this.mode = 'slide';
    this.route = 'none';
    this.routeProfile = null;
    this.direction = direction >= 0 ? 1 : -1;
    this.startPosition.copy(this.basePosition);
    this.startTarget.copy(this.baseTarget);
    this.endPosition.copy(anchor.position);
    this.endTarget.copy(anchor.target);

    const distance = this.startPosition.distanceTo(this.endPosition);
    const outward = this.startPosition.clone().add(this.endPosition).setY(0);
    if (outward.lengthSq() < 0.001) outward.set(this.direction, 0, 1);
    outward.normalize().multiplyScalar(THREE.MathUtils.clamp(distance * 0.12, 1.8, 3.8));
    this.controlA.copy(this.startPosition).lerp(this.endPosition, 0.3).add(outward);
    this.controlB.copy(this.startPosition).lerp(this.endPosition, 0.7).add(outward);
    this.controlA.y += this.direction * 0.65;
    this.controlB.y -= this.direction * 0.35;
    this.targetControlA.copy(this.startTarget).lerp(this.endTarget, 0.3);
    this.targetControlB.copy(this.startTarget).lerp(this.endTarget, 0.7);
    this.elapsed = 0;
    this.duration = THREE.MathUtils.clamp(0.72 + distance * 0.012, 0.82, 1.08);
    this.traveling = true;
  }

  update(delta: number, pointer: THREE.Vector2, mobile: boolean): JourneyFrame {
    let progress = 1;
    if (this.traveling) {
      this.elapsed = Math.min(this.duration, this.elapsed + delta);
      progress = this.duration > 0 ? this.elapsed / this.duration : 1;
      const eased = easeInOutQuint(progress);
      this.cubicBezier(this.startPosition, this.controlA, this.controlB, this.endPosition, eased, this.basePosition);
      this.applyRouteMotion(progress, eased);
      this.cubicBezier(
        this.startTarget,
        this.targetControlA,
        this.targetControlB,
        this.endTarget,
        easeInOutQuint(THREE.MathUtils.smoothstep(progress, 0.04, 0.96)),
        this.baseTarget,
      );
      if (progress >= 1) {
        this.traveling = false;
        this.basePosition.copy(this.endPosition);
        this.baseTarget.copy(this.endTarget);
      }
    }

    const frameMode = this.traveling ? this.mode : 'idle';
    const frameRoute = this.traveling ? this.route : 'none';
    const intensity = this.traveling ? Math.sin(progress * Math.PI) : 0;
    this.forward.subVectors(this.baseTarget, this.basePosition).normalize();
    this.right.crossVectors(this.forward, WORLD_UP).normalize();
    const horizontal = pointer.x * (mobile ? 0.11 : 0.34);
    const vertical = -pointer.y * (mobile ? 0.08 : 0.22);
    this.parallax.copy(this.right).multiplyScalar(horizontal).addScaledVector(WORLD_UP, vertical);

    this.camera.position.copy(this.basePosition).add(this.parallax);
    if (this.traveling && this.mode === 'space' && this.routeProfile) {
      const shakeEnvelope = Math.pow(Math.sin(progress * Math.PI), 1.4) * this.routeProfile.cameraShake;
      this.cameraShake.copy(this.right).multiplyScalar(Math.sin(this.elapsed * 31) * shakeEnvelope);
      this.cameraShake.y += Math.sin(this.elapsed * 24 + 0.8) * shakeEnvelope * 0.62;
      this.camera.position.add(this.cameraShake);
    }
    this.target.copy(this.baseTarget).addScaledVector(this.parallax, 0.42);
    const routeRoll = this.routeProfile?.roll ?? 0.085;
    const rollDirection = this.route === 'spiral'
      ? Math.sin(progress * Math.PI * 2) * this.direction
      : this.route === 'rift'
        ? (progress < 0.5 ? 1 : -1) * this.direction
        : this.route === 'slingshot'
          ? Math.sin(progress * Math.PI) * this.direction
          : this.route === 'recoil'
            ? Math.cos(progress * Math.PI * 3) * (1 - progress) * this.direction
            : this.direction;
    this.camera.up.set(rollDirection * intensity * routeRoll, 1, 0).normalize();
    this.camera.lookAt(this.target);
    const fovEnvelope = this.traveling && this.mode === 'space'
      ? Math.pow(Math.sin(progress * Math.PI), this.route === 'rift' ? 2.4 : 0.82)
      : 0;
    const targetFov = this.restFov + (this.routeProfile?.fovKick ?? 0) * fovEnvelope;
    if (Math.abs(this.camera.fov - targetFov) > 0.001) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    return { active: this.traveling, progress, intensity, mode: frameMode, route: frameRoute };
  }

  getTarget(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.baseTarget);
  }

  private cubicBezier(
    start: THREE.Vector3,
    controlA: THREE.Vector3,
    controlB: THREE.Vector3,
    end: THREE.Vector3,
    progress: number,
    target: THREE.Vector3,
  ): void {
    const inverse = 1 - progress;
    target.set(0, 0, 0)
      .addScaledVector(start, inverse * inverse * inverse)
      .addScaledVector(controlA, 3 * inverse * inverse * progress)
      .addScaledVector(controlB, 3 * inverse * progress * progress)
      .addScaledVector(end, progress * progress * progress);
  }

  private applyRouteMotion(progress: number, eased: number): void {
    if (this.mode !== 'space' || this.route === 'none') return;
    const envelope = Math.sin(progress * Math.PI);
    this.routeOffset.set(0, 0, 0);
    if (this.route === 'spiral') {
      const angle = eased * Math.PI * 4 * this.direction;
      this.routeOffset
        .addScaledVector(this.travelSide, Math.cos(angle) * envelope * 3.1)
        .addScaledVector(WORLD_UP, Math.sin(angle) * envelope * 2.7);
    } else if (this.route === 'dive') {
      this.routeOffset.y = -Math.sin(eased * Math.PI) * 3.2;
      this.routeOffset.addScaledVector(this.travelSide, Math.sin(eased * Math.PI * 2) * envelope * 0.8);
    } else if (this.route === 'orbit') {
      this.routeOffset.y = Math.sin(eased * Math.PI * 2) * envelope * 1.05;
      this.routeOffset.addScaledVector(this.travelSide, envelope * 1.8 * this.direction);
    } else if (this.route === 'close-pass') {
      this.routeOffset.addScaledVector(this.travelSide, Math.sin(eased * Math.PI) * 2.8 * this.direction);
      this.routeOffset.y = Math.sin(eased * Math.PI * 2) * envelope * 0.9;
    } else if (this.route === 'fly-through') {
      this.routeOffset.addScaledVector(this.travelSide, Math.sin(eased * Math.PI * 2) * envelope * 0.45);
    } else if (this.route === 'rift') {
      const split = progress < 0.5 ? -1 : 1;
      const cutEnvelope = Math.pow(Math.sin(progress * Math.PI), 0.72);
      this.routeOffset.addScaledVector(this.travelSide, split * cutEnvelope * 3.8 * this.direction);
      this.routeOffset.y = Math.sin(progress * Math.PI * 4) * envelope * 0.72;
    } else if (this.route === 'slingshot') {
      const whip = Math.sin(Math.pow(progress, 1.6) * Math.PI * 2) * envelope;
      this.routeOffset.addScaledVector(this.travelSide, whip * 4.1 * this.direction);
      this.routeOffset.y = Math.sin(progress * Math.PI) * 1.6;
    } else if (this.route === 'ascent') {
      this.routeOffset.addScaledVector(this.travelSide, Math.sin(progress * Math.PI * 2) * envelope * 0.85);
      this.routeOffset.y += Math.sin(progress * Math.PI) * 2.2;
    } else if (this.route === 'recoil') {
      const recoil = Math.sin(progress * Math.PI * 5) * Math.pow(1 - progress, 1.4);
      this.routeOffset.addScaledVector(this.travelSide, recoil * 2.2 * this.direction);
      this.routeOffset.y = -Math.sin(progress * Math.PI * 3) * envelope * 1.15;
    }
    this.basePosition.add(this.routeOffset);
  }
}
