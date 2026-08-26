import type { SceneDirection, ScenePhase } from '../world/SceneDirector';
import type { WorldProfile } from '../data/games';

export interface AudioBands {
  bass: number;
  mids: number;
  highs: number;
  overall: number;
}

export class CinematicAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private heatGain: GainNode | null = null;
  private ambientOscillator: OscillatorNode | null = null;
  private heatOscillator: OscillatorNode | null = null;
  private mediaElement: HTMLMediaElement | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;
  private readonly bands: AudioBands = { bass: 0, mids: 0, highs: 0, overall: 0 };
  private enabled = false;
  private phase: ScenePhase = 'idle';
  private worldRoot = 164;

  setWorld(profile: WorldProfile): void {
    this.worldRoot = profile.audioRoot;
    if (!this.context || !this.ambientOscillator) return;
    this.ambientOscillator.frequency.setTargetAtTime(
      Math.max(32, profile.audioRoot / 4),
      this.context.currentTime,
      0.42,
    );
  }

  attachMediaElement(element: HTMLMediaElement): void {
    this.mediaElement = element;
    if (this.context) this.connectMediaAnalyser();
  }

  getBands(): AudioBands {
    if (!this.analyser || !this.frequencyData || !this.context || !this.enabled) {
      this.bands.bass *= 0.92;
      this.bands.mids *= 0.92;
      this.bands.highs *= 0.9;
      this.bands.overall *= 0.92;
      return this.bands;
    }
    this.analyser.getByteFrequencyData(this.frequencyData);
    const nyquist = this.context.sampleRate / 2;
    const averageRange = (fromHz: number, toHz: number): number => {
      const start = Math.max(0, Math.floor(fromHz / nyquist * this.frequencyData!.length));
      const end = Math.min(this.frequencyData!.length, Math.ceil(toHz / nyquist * this.frequencyData!.length));
      let sum = 0;
      for (let index = start; index < end; index += 1) sum += this.frequencyData![index];
      return end > start ? Math.sqrt(sum / (end - start) / 255) : 0;
    };
    const bass = averageRange(28, 190);
    const mids = averageRange(190, 2200);
    const highs = averageRange(2200, 9200);
    const overall = bass * 0.42 + mids * 0.38 + highs * 0.2;
    this.bands.bass += (bass - this.bands.bass) * 0.18;
    this.bands.mids += (mids - this.bands.mids) * 0.14;
    this.bands.highs += (highs - this.bands.highs) * 0.2;
    this.bands.overall += (overall - this.bands.overall) * 0.12;
    return this.bands;
  }

  unlock(): void {
    if (!this.context) this.createGraph();
    if (this.context?.state === 'suspended') void this.context.resume();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.unlock();
    const now = this.context?.currentTime ?? 0;
    this.master?.gain.cancelScheduledValues(now);
    this.master?.gain.setTargetAtTime(enabled ? 0.17 : 0, now, 0.08);
  }

  update(direction: SceneDirection): void {
    if (!this.context || !this.ambientGain || !this.heatGain || !this.heatOscillator) return;
    const now = this.context.currentTime;
    this.ambientGain.gain.setTargetAtTime(this.enabled ? 0.018 * direction.audioEnergy : 0, now, 0.18);
    this.heatGain.gain.setTargetAtTime(this.enabled ? direction.heat * 0.026 : 0, now, 0.08);
    this.heatOscillator.frequency.setTargetAtTime(54 + direction.heat * 92, now, 0.08);
    this.phase = direction.phase;
  }

  impact(power: number): void {
    if (!this.enabled || !this.context || !this.master) return;
    const now = this.context.currentTime;
    this.transient(64 + power * 16, 0.14 + power * 0.05, 0.18, 'sine', now, 42, -0.72);
    this.transient(310 + power * 95, 0.035 + power * 0.012, 0.09, 'triangle', now + 0.012, 210, -0.42);
    this.transient(92 + power * 9, 0.04, 0.24, 'sine', now + 0.045, 62, 0.05);
  }

  portalReady(): void {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    this.transient(92, 0.085, 0.82, 'sine', now, 248, 0);
    const toePans = [-0.62, -0.22, 0.22, 0.62];
    toePans.forEach((pan, index) => {
      this.transient(186 + index * 24, 0.027, 0.42, 'triangle', now + 0.13 + index * 0.14, 320 + index * 32, pan);
    });
    this.transient(128, 0.052, 0.68, 'sine', now + 0.72, 256, 0);
  }

  journey(routeIndex: number): void {
    if (!this.enabled || !this.context) return;
    const start = this.worldRoot * 0.44 + routeIndex * 2.5;
    this.transient(start, 0.13, 1.65, routeIndex % 2 ? 'sawtooth' : 'triangle', this.context.currentTime, 280 + routeIndex * 18, routeIndex % 2 ? 0.22 : -0.22);
  }

  arrival(index: number): void {
    if (!this.enabled || !this.context) return;
    const root = this.worldRoot;
    const now = this.context.currentTime;
    this.transient(root, 0.052, 0.62, 'sine', now, root * 1.5, -0.18);
    this.transient(root * 1.5, 0.036, 0.72, 'triangle', now + 0.09, root * 2, 0.18);
    this.transient(root * 2, 0.022, 0.86, 'sine', now + 0.18, root * 2.5, 0);
  }

  secretHint(level: number): void {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    this.transient(118 + level * 9, 0.028, 0.9, 'sine', now, 71);
    this.transient(356 + level * 14, 0.016, 1.1, 'triangle', now + 0.18, 178);
  }

  dispose(): void {
    this.ambientOscillator?.stop();
    this.heatOscillator?.stop();
    void this.context?.close();
    this.context = null;
  }

  private createGraph(): void {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);

    this.ambientGain = this.context.createGain();
    this.ambientGain.gain.value = 0;
    this.ambientGain.connect(this.master);
    this.ambientOscillator = this.context.createOscillator();
    this.ambientOscillator.type = 'sine';
    this.ambientOscillator.frequency.value = 43;
    this.ambientOscillator.connect(this.ambientGain);
    this.ambientOscillator.start();

    this.heatGain = this.context.createGain();
    this.heatGain.gain.value = 0;
    this.heatGain.connect(this.master);
    this.heatOscillator = this.context.createOscillator();
    this.heatOscillator.type = 'triangle';
    this.heatOscillator.frequency.value = 54;
    this.heatOscillator.connect(this.heatGain);
    this.heatOscillator.start();
    this.connectMediaAnalyser();
  }

  private connectMediaAnalyser(): void {
    if (!this.context || !this.mediaElement || this.mediaSource) return;
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.82;
    this.frequencyData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    this.mediaSource = this.context.createMediaElementSource(this.mediaElement);
    this.mediaSource.connect(this.analyser);
    this.analyser.connect(this.context.destination);
  }

  private transient(
    frequency: number,
    volume: number,
    duration: number,
    type: OscillatorType,
    startAt = this.context?.currentTime ?? 0,
    endFrequency = frequency * 0.55,
    pan = 0,
  ): void {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(22, endFrequency), startAt + duration);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), startAt + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    if (typeof this.context.createStereoPanner === 'function') {
      const panner = this.context.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), startAt);
      gain.connect(panner);
      panner.connect(this.master);
    } else {
      gain.connect(this.master);
    }
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.03);
  }
}
