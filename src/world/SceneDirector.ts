export type ScenePhase =
  | 'idle'
  | 'dream'
  | 'attention'
  | 'heating'
  | 'ready-quiet'
  | 'ready'
  | 'travel'
  | 'arrival';

export interface SceneDirection {
  phase: ScenePhase;
  activity: number;
  particleLevel: number;
  lightLevel: number;
  cameraPush: number;
  portalFocus: number;
  arrivalEnvelope: number;
  audioEnergy: number;
  heat: number;
}

export class SceneDirector {
  private phase: ScenePhase = 'idle';
  private previousReady = false;
  private readyAge = 10;
  private arrivalAge = 10;
  private lastAttentionAt = -100;
  private smoothedActivity = 0.62;

  noteAttention(elapsed: number): void {
    this.lastAttentionAt = elapsed;
  }

  beginTravel(): void {
    this.phase = 'travel';
    this.arrivalAge = 10;
  }

  beginArrival(): void {
    this.phase = 'arrival';
    this.arrivalAge = 0;
  }

  update(
    delta: number,
    elapsed: number,
    portalHeat: number,
    portalReady: boolean,
    traveling: boolean,
  ): SceneDirection {
    if (this.lastAttentionAt < 0) this.lastAttentionAt = elapsed;
    if (portalReady && !this.previousReady) this.readyAge = 0;
    this.previousReady = portalReady;
    this.readyAge += delta;
    this.arrivalAge += delta;

    let next: ScenePhase;
    if (traveling) next = 'travel';
    else if (this.arrivalAge < 1.45) next = 'arrival';
    else if (portalReady && this.readyAge < 0.28) next = 'ready-quiet';
    else if (portalReady) next = 'ready';
    else if (portalHeat > 0.015) next = 'heating';
    else if (elapsed - this.lastAttentionAt < 2.2) next = 'attention';
    else if (elapsed - this.lastAttentionAt > 18) next = 'dream';
    else next = 'idle';
    this.phase = next;

    const arrivalEnvelope = next === 'arrival'
      ? Math.sin(Math.min(1, this.arrivalAge / 1.45) * Math.PI)
      : 0;
    const targetActivity = next === 'dream'
      ? 0.46
      : next === 'idle'
      ? 0.62
      : next === 'attention'
        ? 0.76
        : next === 'heating'
          ? 0.72 + portalHeat * 0.46
          : next === 'ready-quiet'
            ? 0.22
            : next === 'ready'
              ? 0.88
              : next === 'travel'
                ? 1.28
                : 0.86 + arrivalEnvelope * 0.34;
    this.smoothedActivity += (targetActivity - this.smoothedActivity) * (1 - Math.exp(-delta * 5.5));

    const direction: SceneDirection = {
      phase: next,
      activity: this.smoothedActivity,
      particleLevel: next === 'ready-quiet' ? 0.14 : next === 'dream' ? 0.42 : next === 'idle' ? 0.64 : Math.min(1.25, targetActivity),
      lightLevel: next === 'ready-quiet' ? 0.34 : next === 'dream' ? 0.58 : next === 'idle' ? 0.72 : Math.min(1.3, 0.76 + targetActivity * 0.36),
      cameraPush: next === 'dream' ? -0.035 : next === 'heating' ? portalHeat * 0.26 : next === 'ready' ? 0.22 : arrivalEnvelope * 0.12,
      portalFocus: next === 'ready-quiet' ? 0.72 : next === 'ready' ? 1 : 0,
      arrivalEnvelope,
      audioEnergy: next === 'dream' ? 0.1 : next === 'idle' ? 0.18 : next === 'attention' ? 0.3 : next === 'heating' ? 0.34 + portalHeat * 0.56 : next === 'ready-quiet' ? 0.04 : next === 'ready' ? 0.74 : 1,
      heat: portalHeat,
    };
    document.documentElement.dataset.scenePhase = next;
    return direction;
  }

  getPhase(): ScenePhase {
    return this.phase;
  }
}
