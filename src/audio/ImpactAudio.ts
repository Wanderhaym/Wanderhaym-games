export type ImpactAudioState = 'idle' | 'starting' | 'playing' | 'blocked' | 'late' | 'error';

/** A short effect may autoplay when allowed, independently of music/Web Audio.
 * Never wait for preload events before play(): Android may defer those events
 * until playback is requested. Cancel a delayed start instead of replaying an
 * old hammer hit after the visible contact has passed.
 */
export class ImpactAudio {
  private audio: HTMLAudioElement | null = null;
  private cancelPending: (() => void) | null = null;
  private readonly source: string;
  private readonly report: (state: ImpactAudioState, error?: string) => void;
  private readonly createAudio: () => HTMLAudioElement;
  private readonly maxStartDelay: number;

  constructor(source: string, options: {
    report?: (state: ImpactAudioState, error?: string) => void;
    createAudio?: () => HTMLAudioElement;
    maxStartDelay?: number;
  } = {}) {
    this.source = source;
    this.report = options.report ?? (() => undefined);
    this.createAudio = options.createAudio ?? (() => new Audio());
    this.maxStartDelay = options.maxStartDelay ?? 180;
  }

  prepare(): HTMLAudioElement {
    if (!this.audio) {
      const audio = this.createAudio();
      audio.preload = 'auto';
      audio.setAttribute('playsinline', '');
      audio.src = this.source;
      this.audio = audio;
      audio.load();
    }
    return this.audio;
  }

  play(volume = 0.075): void {
    this.stop();
    const audio = this.prepare();
    audio.volume = volume;
    // Seeking may be unavailable before metadata; that must not prevent play.
    try { audio.currentTime = 0; } catch { /* First playback already starts at 0. */ }
    const requestedAt = performance.now();
    let settled = false;
    const settle = (state: ImpactAudioState, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      audio.removeEventListener('playing', started);
      this.cancelPending = null;
      this.report(state, error);
    };
    const started = () => {
      if (settled) return;
      if (performance.now() - requestedAt > this.maxStartDelay) {
        audio.pause();
        settle('late');
      } else {
        settle('playing');
      }
    };
    const deadline = setTimeout(() => {
      audio.pause();
      settle('late');
    }, this.maxStartDelay);
    this.cancelPending = () => {
      audio.pause();
      settle('idle');
    };
    audio.addEventListener('playing', started);
    this.report('starting');
    const rejected = (error: unknown) => {
      if (settled) return;
      const name = error instanceof Error ? error.name : 'UnknownError';
      audio.pause();
      settle(name === 'NotAllowedError' ? 'blocked' : 'error', name);
    };
    try {
      // Also support older WebViews where play() doesn't return a Promise.
      const result = audio.play();
      if (result) void result.then(started, rejected);
    } catch (error) {
      rejected(error);
    }
  }

  stopPending(): void {
    this.cancelPending?.();
  }

  stop(): void {
    this.stopPending();
    this.audio?.pause();
  }
}
