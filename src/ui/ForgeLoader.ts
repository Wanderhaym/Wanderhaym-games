import catIdleUrl from '../../assets/mascot/runtime/cat-00-idle.webp?url';
import catReadyUrl from '../../assets/mascot/runtime/cat-01-ready.webp?url';
import catWindupUrl from '../../assets/mascot/runtime/cat-02-windup.webp?url';
import catSwingUrl from '../../assets/mascot/runtime/cat-03-swing.webp?url';
import catContactUrl from '../../assets/mascot/runtime/cat-04-contact.webp?url';
import catImpactUrl from '../../assets/mascot/runtime/cat-05-impact.webp?url';
import catBlinkHalfUrl from '../../assets/mascot/runtime/cat-blink-half.webp?url';
import catBlinkUrl from '../../assets/mascot/runtime/cat-blink.webp?url';
import catRecoverUrl from '../../assets/mascot/runtime/cat-recover.webp?url';
import platformIdleUrl from '../../assets/mascot/runtime/platform-idle.webp?url';
import platformHitUrl from '../../assets/mascot/runtime/platform-hit.webp?url';

const CAT_FRAMES = [
  catIdleUrl,
  catReadyUrl,
  catWindupUrl,
  catSwingUrl,
  catContactUrl,
  catImpactUrl,
  catBlinkHalfUrl,
  catBlinkUrl,
  catRecoverUrl,
];

declare global {
  interface Window {
    __wanderhaymForgeKickoff?: {
      complete: boolean;
      progress: number;
      startedAt: number;
    };
  }
}

function element<T extends Element>(root: ParentNode, selector: string): T {
  const match = root.querySelector<T>(selector);
  if (!match) throw new Error(`Missing forge loader element: ${selector}`);
  return match;
}

export interface ForgeLoaderOptions {
  title?: string;
  presentText?: string;
  accent?: string;
}

export class ForgeLoader {
  private readonly cat: HTMLImageElement;
  private readonly platform: HTMLImageElement;
  private readonly bar: HTMLElement;
  private readonly value: HTMLElement;
  private readonly status: HTMLElement;
  private readonly sparks: HTMLElement;
  private readonly embers: HTMLElement;
  private readonly assetsReady: Promise<void>;
  private targetProgress = 0;
  private forgedProgress = 0;
  private striking = false;
  private blinking = false;
  private strikeCount = 0;
  private finalStrike = false;
  private finalStrikeRequested = false;
  private completed = false;
  private completionPromise: Promise<void> | null = null;
  private completeResolve: (() => void) | null = null;
  private timers: number[] = [];
  private blinkTimer: number | null = null;

  constructor(private readonly root: HTMLElement, options: ForgeLoaderOptions = {}) {
    if (options.accent) this.root.style.setProperty('--accent', options.accent);
    if (options.title) element<HTMLElement>(this.root, 'h1 span').textContent = options.title;
    if (options.presentText) element<HTMLElement>(this.root, '.forge-loader__present').textContent = options.presentText;
    this.cat = element(root, '#loaderCat');
    this.platform = element(root, '#loaderPlatform');
    this.bar = element(root, '#loaderBar');
    this.value = element(root, '#loaderValue');
    this.status = element(root, '#loaderStatus');
    this.sparks = element(root, '#loaderSparks');
    this.embers = element(root, '#loaderEmbers');
    this.assetsReady = Promise.all([...CAT_FRAMES, platformIdleUrl, platformHitUrl].map(async (source) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = source;
      try {
        await image.decode();
      } catch {
        // The browser can still display an image that does not implement or
        // rejects decode(), so loading must not fail solely on pre-decoding.
      }
    })).then(() => undefined);
    this.createEmbers();

    // index.html starts the first complete hit before the main WebGL bundle
    // has loaded. Adopt that animation instead of resetting its active frame.
    const kickoff = window.__wanderhaymForgeKickoff;
    if (kickoff) {
      this.striking = !kickoff.complete;
      if (kickoff.complete) this.adoptAutonomousKickoff();
      else window.addEventListener('wanderhaym:forge-kickoff-complete', () => this.adoptAutonomousKickoff(), { once: true });
    } else {
      this.cat.src = catIdleUrl;
      this.platform.src = platformIdleUrl;
      this.renderProgress();
      this.scheduleBlink();
      this.after(110, () => {
        if (this.completed || this.targetProgress > 0) return;
        this.root.dataset.forgeKickoff = 'controller-fallback';
        this.targetProgress = 0.08;
        this.requestStrike();
      });
    }
  }

  setProgress(value: number): void {
    this.targetProgress = Math.max(this.targetProgress, Math.min(1, Math.max(0, value)));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.forgedProgress = this.targetProgress;
      this.renderProgress();
      return;
    }
    this.requestStrike();
  }

  ready(): Promise<void> {
    return this.assetsReady;
  }

  complete(): Promise<void> {
    if (this.completionPromise) return this.completionPromise;
    this.completionPromise = new Promise<void>((resolve) => {
      this.completeResolve = resolve;
    });
    this.targetProgress = 1;
    this.finalStrikeRequested = true;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.forgedProgress = 1;
      this.renderProgress();
      this.finish();
    } else {
      this.requestStrike();
      // The autonomous kickoff already guarantees a real first hammer hit.
      // When WebGL finishes quickly, do not force visitors to watch several
      // synthetic progress strikes: promote the current/next hit to the final
      // paw release and enter the world promptly.
      this.after(this.strikeCount > 0 ? 460 : 980, () => {
        if (this.completed || this.strikeCount === 0) return;
        this.finalStrikeRequested = false;
        this.finalStrike = true;
        this.forgedProgress = 1;
        this.root.classList.add('is-final-strike');
        this.renderProgress();
        this.finish();
      });
    }
    return this.completionPromise;
  }

  fail(title: string, message: string): void {
    this.clearTimers();
    this.root.classList.add('has-error');
    element<HTMLElement>(this.root, 'h1').textContent = title;
    this.status.textContent = message;
    this.value.textContent = 'ОШИБКА';
    this.cat.src = catRecoverUrl;
  }

  private requestStrike(): void {
    if (this.completed || this.striking || this.blinking || this.targetProgress <= this.forgedProgress + 0.001) return;
    if (this.blinkTimer !== null) window.clearTimeout(this.blinkTimer);
    this.blinkTimer = null;
    this.striking = true;
    this.finalStrike = this.finalStrikeRequested;
    if (this.finalStrike) {
      this.finalStrikeRequested = false;
      this.root.classList.add('is-final-strike');
      this.status.textContent = 'ФИНАЛЬНАЯ КОВКА';
    }
    this.root.dataset.forgeState = 'windup';
    this.cat.src = catReadyUrl;
    this.after(70, () => {
      this.cat.src = catWindupUrl;
      this.root.dataset.forgeState = 'windup';
    });
    this.after(155, () => {
      this.cat.src = catSwingUrl;
      this.root.dataset.forgeState = 'swing';
    });
    this.after(235, () => this.impact());
    this.after(310, () => {
      this.cat.src = catImpactUrl;
      this.root.dataset.forgeState = 'impact';
    });
    this.after(390, () => {
      this.cat.src = catRecoverUrl;
      this.platform.src = platformIdleUrl;
      this.root.classList.remove('is-impacting');
      this.root.dataset.forgeState = 'recover';
    });
    this.after(500, () => {
      this.cat.src = catIdleUrl;
      this.root.classList.remove('is-settling');
      void this.root.offsetWidth;
      this.root.classList.add('is-settling');
      this.root.dataset.forgeState = 'settle';
    });
    this.after(690, () => {
      this.root.classList.remove('is-settling');
      this.root.dataset.forgeState = this.forgedProgress >= 1 ? 'complete' : 'rest';
      this.striking = false;
      if (this.forgedProgress >= 1 && this.targetProgress >= 1) this.finish();
      else if (this.strikeCount > 0 && this.strikeCount % 3 === 0 && this.forgedProgress < 0.96) {
        // A continuously loading game used to restart the next strike before
        // the random idle blink could fire. Insert one deliberate blink after
        // every third impact so the mascot still feels alive under load.
        this.after(155, () => this.performBlink(false, () => this.after(120, () => this.requestStrike())));
      }
      else {
        this.scheduleBlink();
        // Always hold the deliberate idle pose for a moment before the next
        // strike. This prevents a slow resource from freezing the mascot on a
        // transitional wind-up/recovery frame.
        this.after(this.strikeCount === 1 ? 420 : 160, () => this.requestStrike());
      }
    });
  }

  private impact(): void {
    this.strikeCount += 1;
    this.cat.src = catContactUrl;
    this.platform.src = platformHitUrl;
    this.root.dataset.forgeState = 'contact';
    this.root.classList.remove('is-impacting');
    void this.root.offsetWidth;
    this.root.classList.add('is-impacting');
    this.spawnSparks();

    if (this.finalStrike) {
      this.forgedProgress = 1;
    } else {
      const gap = this.targetProgress - this.forgedProgress;
      const chunk = Math.max(0.075, gap * 0.54);
      this.forgedProgress = Math.min(this.targetProgress, this.forgedProgress + chunk);
    }
    this.renderProgress();
  }

  private renderProgress(): void {
    const percent = Math.round(this.forgedProgress * 100);
    this.bar.style.width = `${percent}%`;
    this.root.style.setProperty('--forge-progress', String(this.forgedProgress));
    this.value.textContent = `${String(percent).padStart(2, '0')}%`;
    this.root.dataset.forgePhase = percent >= 100
      ? 'ready'
      : percent >= 70
        ? 'final'
        : percent >= 20
          ? 'assembly'
          : 'ignition';
    this.status.textContent = percent >= 100
      ? 'МИР ГОТОВ'
      : percent >= 70
        ? 'ФИНАЛЬНАЯ КОВКА'
        : percent >= 20
          ? 'СОБИРАЮ МИР'
          : 'РАЗЖИГАЮ ОГОНЬ';
  }

  private spawnSparks(): void {
    const amount = 13 + Math.round(this.forgedProgress * 12);
    for (let index = 0; index < amount; index += 1) {
      const spark = document.createElement('i');
      const angle = -Math.PI * (0.08 + Math.random() * 0.84);
      const distance = 58 + Math.random() * (76 + this.forgedProgress * 70);
      spark.className = 'forge-loader__spark';
      spark.style.setProperty('--spark-x', `${Math.cos(angle) * distance}px`);
      spark.style.setProperty('--spark-y', `${Math.sin(angle) * distance}px`);
      spark.style.setProperty('--spark-size', `${1.5 + Math.random() * 3.5}px`);
      spark.style.setProperty('--spark-delay', `${Math.random() * 55}ms`);
      spark.addEventListener('animationend', () => spark.remove(), { once: true });
      this.sparks.append(spark);
    }
  }

  private createEmbers(): void {
    for (let index = 0; index < 20; index += 1) {
      const ember = document.createElement('i');
      ember.style.setProperty('--ember-x', `${3 + Math.random() * 94}%`);
      ember.style.setProperty('--ember-size', `${1 + Math.random() * 2.5}px`);
      ember.style.setProperty('--ember-duration', `${4.8 + Math.random() * 6.5}s`);
      ember.style.setProperty('--ember-delay', `${-Math.random() * 9}s`);
      ember.style.setProperty('--ember-drift', `${-34 + Math.random() * 68}px`);
      this.embers.append(ember);
    }
  }

  private finish(): void {
    if (this.completed) return;
    this.completed = true;
    if (this.blinkTimer !== null) window.clearTimeout(this.blinkTimer);
    this.blinkTimer = null;
    this.root.dataset.forgeState = 'complete';
    this.status.textContent = 'МИР ГОТОВ';
    this.root.classList.add('is-world-opening');
    const exitDuration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 120 : 860;
    this.after(exitDuration, () => this.completeResolve?.());
  }

  private adoptAutonomousKickoff(): void {
    if (this.completed) return;
    const kickoffProgress = window.__wanderhaymForgeKickoff?.progress ?? 0.08;
    this.strikeCount = Math.max(1, this.strikeCount);
    this.forgedProgress = Math.max(this.forgedProgress, kickoffProgress, 0.08);
    this.targetProgress = Math.max(this.targetProgress, this.forgedProgress);
    this.cat.src = catIdleUrl;
    this.platform.src = platformIdleUrl;
    this.root.classList.remove('is-impacting', 'is-settling');
    this.root.dataset.forgeState = 'rest';
    this.striking = false;
    this.renderProgress();
    this.scheduleBlink();
    this.after(90, () => this.requestStrike());
  }

  private scheduleBlink(): void {
    if (this.blinkTimer !== null) window.clearTimeout(this.blinkTimer);
    if (this.completed) return;
    const delay = 1500 + Math.random() * 2600;
    this.blinkTimer = window.setTimeout(() => {
      this.blinkTimer = null;
      if (this.striking || this.completed) {
        this.scheduleBlink();
        return;
      }
      this.performBlink(Math.random() > 0.72, () => {
        // Loading can finish while the eyes are closed. Resume a queued hit
        // immediately after the blink instead of leaving the forge at rest.
        if (this.targetProgress > this.forgedProgress + 0.001) this.requestStrike();
        else this.scheduleBlink();
      });
    }, delay);
  }

  private performBlink(doubleBlink: boolean, onComplete: () => void): void {
    if (this.striking || this.completed || this.blinking) {
      onComplete();
      return;
    }
    this.blinking = true;
    this.root.dataset.forgeState = 'blink';
    this.cat.src = catBlinkHalfUrl;
    this.after(72, () => { if (!this.striking) this.cat.src = catBlinkUrl; });
    this.after(142, () => { if (!this.striking) this.cat.src = catBlinkHalfUrl; });
    this.after(215, () => { if (!this.striking) this.cat.src = catIdleUrl; });
    if (doubleBlink) {
      this.after(330, () => { if (!this.striking) this.cat.src = catBlinkHalfUrl; });
      this.after(395, () => { if (!this.striking) this.cat.src = catBlinkUrl; });
      this.after(465, () => { if (!this.striking) this.cat.src = catIdleUrl; });
    }
    this.after(doubleBlink ? 520 : 275, () => {
      this.blinking = false;
      this.root.dataset.forgeState = 'rest';
      onComplete();
    });
  }

  private after(delay: number, callback: () => void): void {
    const timer = window.setTimeout(() => {
      this.timers = this.timers.filter((entry) => entry !== timer);
      callback();
    }, delay);
    this.timers.push(timer);
  }

  private clearTimers(): void {
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers = [];
    if (this.blinkTimer !== null) window.clearTimeout(this.blinkTimer);
    this.blinkTimer = null;
    this.blinking = false;
  }
}
