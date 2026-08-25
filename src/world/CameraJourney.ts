import * as THREE from 'three';

export interface CameraAnchor {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export interface JourneyFrame {
  active: boolean;
  progress: number;
  intensity: number;
}

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
  private readonly basePosition = new THREE.Vector3();
  private readonly baseTarget = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly parallax = new THREE.Vector3();
  private elapsed = 0;
  private duration = 0;
  private traveling = false;
  private direction = 1;

  constructor(camera: THREE.PerspectiveCamera, initial: CameraAnchor) {
    this.camera = camera;
    this.jumpTo(initial);
  }

  jumpTo(anchor: CameraAnchor): void {
    this.traveling = false;
    this.elapsed = 0;
    this.duration = 0;
    this.basePosition.copy(anchor.position);
    this.baseTarget.copy(anchor.target);
    this.target.copy(anchor.target);
    this.camera.position.copy(anchor.position);
    this.camera.up.copy(WORLD_UP);
    this.camera.lookAt(this.target);
  }

  travelTo(anchor: CameraAnchor, direction: number): void {
    this.direction = direction >= 0 ? 1 : -1;
    this.startPosition.copy(this.basePosition);
    this.startTarget.copy(this.baseTarget);
    this.endPosition.copy(anchor.position);
    this.endTarget.copy(anchor.target);

    const distance = this.startPosition.distanceTo(this.endPosition);
    const lift = THREE.MathUtils.clamp(distance * 0.16, 2.8, 5.6);
    const outward = this.startPosition.clone().add(this.endPosition);
    outward.y = 0;
    if (outward.lengthSq() < 0.001) outward.set(this.direction, 0, 1);
    outward.normalize().multiplyScalar(THREE.MathUtils.clamp(distance * 0.22, 2.5, 6.5));

    this.controlA.copy(this.startPosition).lerp(this.endPosition, 0.27).add(outward);
    this.controlB.copy(this.startPosition).lerp(this.endPosition, 0.73).add(outward);
    this.controlA.y += lift;
    this.controlB.y += lift * 0.84;
    this.elapsed = 0;
    this.duration = THREE.MathUtils.clamp(1.55 + distance * 0.032, 1.85, 2.45);
    this.traveling = true;
  }

  update(delta: number, pointer: THREE.Vector2, mobile: boolean): JourneyFrame {
    let progress = 1;
    if (this.traveling) {
      this.elapsed = Math.min(this.duration, this.elapsed + delta);
      progress = this.duration > 0 ? this.elapsed / this.duration : 1;
      const eased = easeInOutQuint(progress);
      this.cubicBezier(this.startPosition, this.controlA, this.controlB, this.endPosition, eased, this.basePosition);
      this.baseTarget.lerpVectors(this.startTarget, this.endTarget, easeInOutQuint(THREE.MathUtils.smoothstep(progress, 0.08, 0.92)));
      if (progress >= 1) {
        this.traveling = false;
        this.basePosition.copy(this.endPosition);
        this.baseTarget.copy(this.endTarget);
      }
    }

    const intensity = this.traveling ? Math.sin(progress * Math.PI) : 0;
    this.forward.subVectors(this.baseTarget, this.basePosition).normalize();
    this.right.crossVectors(this.forward, WORLD_UP).normalize();
    const horizontal = pointer.x * (mobile ? 0.11 : 0.34);
    const vertical = -pointer.y * (mobile ? 0.08 : 0.22);
    this.parallax.copy(this.right).multiplyScalar(horizontal).addScaledVector(WORLD_UP, vertical);

    this.camera.position.copy(this.basePosition).add(this.parallax);
    this.target.copy(this.baseTarget).addScaledVector(this.parallax, 0.42);
    this.camera.up.set(this.direction * intensity * 0.085, 1, 0).normalize();
    this.camera.lookAt(this.target);

    return { active: this.traveling, progress, intensity };
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
}
