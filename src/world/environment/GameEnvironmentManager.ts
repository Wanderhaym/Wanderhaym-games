import * as THREE from 'three';
import type { QualitySettings } from '../../core/quality';
import type { GameData } from '../../data/games';
import type { JourneyFrame, JourneyMode } from '../CameraJourney';
import { GameEnvironment } from './GameEnvironment';
import { createWorldTheme, type WorldTheme } from './WorldTheme';

export class GameEnvironmentManager {
  private readonly scene: THREE.Scene;
  private readonly slots: [GameEnvironment, GameEnvironment];
  private readonly moodColor = new THREE.Color(0x05070c);
  private readonly fogColor = new THREE.Color(0x05070c);
  private activeSlot = 0;
  private incomingSlot = 1;
  private activeTheme: WorldTheme | null = null;
  private incomingTheme: WorldTheme | null = null;
  private transitioning = false;
  private mode: JourneyMode = 'idle';
  private mobile = false;

  constructor(scene: THREE.Scene, quality: QualitySettings) {
    this.scene = scene;
    this.slots = [
      new GameEnvironment(quality, 'A'),
      new GameEnvironment(quality, 'B'),
    ];
  }

  initialize(parent: THREE.Group, index: number, game: GameData): void {
    const theme = createWorldTheme(index, game);
    const slot = this.slots[this.activeSlot];
    slot.configure(theme);
    slot.setMobile(this.mobile);
    parent.add(slot.group);
    slot.group.visible = true;
    this.activeTheme = theme;
    this.incomingTheme = null;
    this.transitioning = false;
    this.applyMood(theme, 1);
  }

  transitionTo(
    parent: THREE.Group,
    index: number,
    game: GameData,
    immediate: boolean,
    mode: Exclude<JourneyMode, 'idle'>,
  ): void {
    if (this.transitioning) this.finishTransition();
    const theme = createWorldTheme(index, game);
    if (immediate) {
      const active = this.slots[this.activeSlot];
      active.configure(theme);
      active.setMobile(this.mobile);
      parent.add(active.group);
      active.group.visible = true;
      this.activeTheme = theme;
      this.applyMood(theme, 1);
      return;
    }
    this.mode = mode;
    this.incomingSlot = this.activeSlot === 0 ? 1 : 0;
    const incoming = this.slots[this.incomingSlot];
    incoming.configure(theme);
    incoming.setMobile(this.mobile);
    parent.add(incoming.group);
    incoming.group.visible = true;
    this.incomingTheme = theme;
    this.transitioning = true;
  }

  setMobile(mobile: boolean): void {
    this.mobile = mobile;
    this.slots.forEach((slot) => slot.setMobile(mobile));
  }

  impact(strength: number): void {
    this.slots[this.activeSlot].impactBurst(strength);
    if (this.transitioning) this.slots[this.incomingSlot].impactBurst(strength * 0.72);
  }

  update(
    delta: number,
    elapsed: number,
    frame: JourneyFrame,
    pointer: THREE.Vector2,
    activity = 1,
  ): void {
    if (!this.activeTheme) return;
    const active = this.slots[this.activeSlot];
    if (!this.transitioning || !this.incomingTheme) {
      active.update(delta, elapsed, activity, 0, pointer);
      this.applyMood(this.activeTheme, 0.08);
      return;
    }

    const progress = frame.progress;
    const spatial = this.mode === 'space';
    const outgoingEnd = !spatial
      ? 0.72
      : frame.route === 'fly-through' || frame.route === 'spiral'
        ? 0.5
        : frame.route === 'orbit'
          ? 0.66
          : frame.route === 'rift'
            ? 0.4
            : frame.route === 'slingshot'
              ? 0.7
              : frame.route === 'ascent'
                ? 0.62
                : frame.route === 'relic-forge'
                  ? 0.5
                : frame.route === 'recoil'
                  ? 0.44
                  : 0.57;
    const incomingStart = !spatial
      ? 0.2
      : frame.route === 'close-pass'
        ? 0.46
        : frame.route === 'orbit'
          ? 0.3
          : frame.route === 'rift'
            ? 0.58
            : frame.route === 'slingshot'
              ? 0.52
              : frame.route === 'ascent'
                ? 0.42
                : frame.route === 'relic-forge'
                  ? 0.54
                : frame.route === 'recoil'
                  ? 0.6
                  : 0.36;
    const outgoingReveal = 1 - THREE.MathUtils.smoothstep(progress, 0.04, outgoingEnd);
    const outgoingDisperse = THREE.MathUtils.smoothstep(progress, spatial ? 0.08 : 0.04, outgoingEnd);
    const incomingReveal = THREE.MathUtils.smoothstep(progress, incomingStart, 0.94);
    active.update(delta, elapsed, outgoingReveal * activity, outgoingDisperse, pointer);
    const incoming = this.slots[this.incomingSlot];
    incoming.update(delta, elapsed, incomingReveal * activity, 0, pointer);
    if (spatial) this.applyRouteChoreography(active, incoming, frame);
    this.applyMood(this.incomingTheme, THREE.MathUtils.smoothstep(progress, 0.28, 0.82));
    if (!frame.active && progress >= 1) this.finishTransition();
  }

  getActiveKind(): string {
    return this.incomingTheme?.kind ?? this.activeTheme?.kind ?? 'none';
  }

  dispose(): void {
    this.slots.forEach((slot) => slot.dispose());
  }

  private finishTransition(): void {
    if (!this.transitioning || !this.incomingTheme) return;
    const outgoing = this.slots[this.activeSlot];
    outgoing.group.visible = false;
    this.activeSlot = this.incomingSlot;
    this.activeTheme = this.incomingTheme;
    this.incomingTheme = null;
    this.transitioning = false;
    this.mode = 'idle';
    if (this.activeTheme) this.applyMood(this.activeTheme, 1);
  }

  private applyMood(theme: WorldTheme, amount: number): void {
    const blend = THREE.MathUtils.clamp(amount, 0, 1);
    this.moodColor.lerp(theme.background, blend);
    this.fogColor.lerp(theme.fog, blend);
    if (this.scene.background instanceof THREE.Color) this.scene.background.copy(this.moodColor);
    else this.scene.background = this.moodColor.clone();
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.copy(this.fogColor);
  }

  private applyRouteChoreography(
    outgoing: GameEnvironment,
    incoming: GameEnvironment,
    frame: JourneyFrame,
  ): void {
    if (frame.route === 'none') return;
    const progress = frame.progress;
    const out = THREE.MathUtils.smoothstep(progress, 0.06, 0.68);
    const enter = 1 - THREE.MathUtils.smoothstep(progress, 0.34, 0.96);
    const envelope = Math.sin(progress * Math.PI);

    if (frame.route === 'orbit') {
      outgoing.group.position.x -= out * 2.4;
      outgoing.group.rotation.y += out * 0.34;
      incoming.group.position.x += enter * 2.2;
      incoming.group.rotation.y -= enter * 0.3;
    } else if (frame.route === 'spiral') {
      outgoing.group.rotation.z += out * Math.PI * 0.72;
      outgoing.group.position.z -= out * 3.2;
      incoming.group.rotation.z -= enter * Math.PI * 0.62;
      incoming.group.position.z -= enter * 2.5;
    } else if (frame.route === 'close-pass') {
      outgoing.group.position.x += out * 4.4;
      outgoing.group.rotation.y -= out * 0.52;
      incoming.group.position.x -= enter * 3.6;
      incoming.group.rotation.y += enter * 0.42;
    } else if (frame.route === 'dive') {
      outgoing.group.position.y += out * 3.1;
      outgoing.group.rotation.x -= out * 0.42;
      incoming.group.position.y -= enter * 2.8;
      incoming.group.rotation.x += enter * 0.34;
    } else if (frame.route === 'fly-through') {
      outgoing.group.position.z += out * 7.2;
      outgoing.group.scale.multiplyScalar(1 + out * 0.3);
      incoming.group.position.z -= enter * 6.4;
      incoming.group.scale.multiplyScalar(1 - enter * 0.24);
    } else if (frame.route === 'tunnel') {
      outgoing.group.position.z -= out * 5.4;
      outgoing.group.scale.multiplyScalar(1 - out * 0.28);
      incoming.group.position.z += enter * 5.8;
      incoming.group.scale.multiplyScalar(1 + enter * 0.22);
    } else if (frame.route === 'rift') {
      const tear = progress < 0.5 ? -1 : 1;
      outgoing.group.position.x += tear * out * 3.8;
      outgoing.group.position.y += Math.sin(progress * Math.PI * 4) * envelope * 0.55;
      outgoing.group.scale.y *= 1 - out * 0.38;
      incoming.group.position.x -= tear * enter * 3.2;
      incoming.group.scale.y *= 1 - enter * 0.32;
    } else if (frame.route === 'slingshot') {
      outgoing.group.position.x -= Math.sin(progress * Math.PI) * 4.8;
      outgoing.group.position.z -= out * 2.6;
      outgoing.group.rotation.z -= out * 0.48;
      incoming.group.position.x += enter * 4.6;
      incoming.group.position.y += enter * 1.3;
      incoming.group.rotation.z += enter * 0.54;
    } else if (frame.route === 'ascent') {
      outgoing.group.position.y -= out * 4.6;
      outgoing.group.scale.multiplyScalar(1 - out * 0.18);
      incoming.group.position.y -= enter * 5.2;
      incoming.group.scale.multiplyScalar(1 - enter * 0.26);
      incoming.group.rotation.y += enter * 0.18;
    } else if (frame.route === 'recoil') {
      const kick = Math.sin(progress * Math.PI * 5) * Math.pow(1 - progress, 1.2);
      outgoing.group.position.z += out * 5.8 + kick * 1.7;
      outgoing.group.rotation.y += kick * 0.34;
      incoming.group.position.z -= enter * 5.2;
      incoming.group.rotation.y -= enter * 0.38;
      incoming.group.scale.multiplyScalar(1 - enter * 0.2);
    } else if (frame.route === 'relic-forge') {
      const gate = Math.sin(progress * Math.PI * 8) * envelope;
      outgoing.group.position.z -= out * 4.8;
      outgoing.group.scale.set(1 - out * 0.34, 1 + gate * 0.08, 1 - out * 0.34);
      incoming.group.position.z += enter * 6.2;
      incoming.group.rotation.z = gate * 0.08;
      incoming.group.scale.set(1 - enter * 0.42, 1 - enter * 0.18, 1 - enter * 0.42);
    }
  }
}
