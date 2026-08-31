import musicUrl from '../../assets/music.mp3?url';
import { allGames, games } from '../data/games';
import { detectQuality } from './quality';
import { GameWorld } from '../world/GameWorld';
import { TeleportCounter, type TeleportCounterState } from '../services/TeleportCounter';
import { CinematicAudio } from '../audio/CinematicAudio';
import { playAppImpact } from '../audio/appImpactAudio';
import { ForgeLoader } from '../ui/ForgeLoader';
import { hostPlatform } from '../platform/HostPlatform';

declare global {
  interface Window {
    Wanderhaym3D: {
      getState: () => Record<string, unknown>;
      next: () => void;
      previous: () => void;
      hit: () => void;
      select: (index: number) => void;
    };
  }
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing interface element: ${selector}`);
  return element;
}

const PORTAL_TUTORIAL_KEY = hostPlatform.localStorageKey('wanderhaym.portalTutorial.v1');
const CARD_TAP_TUTORIAL_KEY = hostPlatform.localStorageKey('wanderhaym.cardTapTutorial.v1');
const PORTAL_CLOUD_KEY = hostPlatform.cloudStorageKey('portalProgress.v2');
const LEGACY_PORTAL_TUTORIAL_KEY = 'wanderhaym.portalTutorial.v1';
const LEGACY_CARD_TAP_TUTORIAL_KEY = 'wanderhaym.cardTapTutorial.v1';

function hasCompletedFlag(key: string, legacyKey: string): boolean {
  const current = localStorage.getItem(key);
  if (current === 'complete') return true;
  return hostPlatform.kind !== 'ok' && localStorage.getItem(legacyKey) === 'complete';
}

function hasCompletedPortalTutorial(): boolean {
  try {
    return hasCompletedFlag(PORTAL_TUTORIAL_KEY, LEGACY_PORTAL_TUTORIAL_KEY);
  } catch {
    return false;
  }
}

function hasCompletedCardTapTutorial(): boolean {
  try {
    return hasCompletedFlag(CARD_TAP_TUTORIAL_KEY, LEGACY_CARD_TAP_TUTORIAL_KEY);
  } catch {
    return false;
  }
}

export class Experience {
  private readonly canvas = required<HTMLCanvasElement>('#world');
  private readonly loader = required<HTMLElement>('#loader');
  private readonly forgeLoader = new ForgeLoader(this.loader);
  private readonly ui = required<HTMLElement>('#ui');
  private readonly title = required<HTMLElement>('#gameTitle');
  private readonly description = required<HTMLElement>('#gameDescription');
  private readonly tag = required<HTMLElement>('#gameTag');
  private readonly gameLaunchButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-game-launch]')];
  private readonly gameLaunchLabel = required<HTMLElement>('#gameLaunchLabel');
  private readonly progress = required<HTMLElement>('#progress');
  private readonly accessibleGames = required<HTMLElement>('#accessibleGames');
  private readonly soundButton = required<HTMLButtonElement>('#soundButton');
  private readonly quietButton = required<HTMLButtonElement>('#quietButton');
  private readonly homeButton = required<HTMLAnchorElement>('#homeButton');
  private readonly supportButton = required<HTMLAnchorElement>('#supportButton');
  private readonly portalHud = required<HTMLElement>('#portalHud');
  private readonly portalState = required<HTMLElement>('#portalState');
  private readonly portalHeatValue = required<HTMLElement>('#portalHeatValue');
  private readonly portalHeatBar = required<HTMLElement>('#portalHeatBar');
  private readonly portalDestination = required<HTMLElement>('#portalDestination');
  private readonly teleportCounterElement = required<HTMLElement>('#teleportCounter');
  private readonly teleportCounterValue = required<HTMLElement>('#teleportCounterValue');
  private readonly interactionCoach = required<HTMLElement>('#interactionCoach');
  private readonly cardTapCoach = required<HTMLElement>('#cardTapCoach');
  private readonly music = required<HTMLAudioElement>('#music');
  private readonly loaderDemo = new URLSearchParams(location.search).has('loader-demo');
  private readonly teleportCounter = new TeleportCounter();
  private readonly cinematicAudio = new CinematicAudio();
  private readonly world: GameWorld;
  private teleportTotal: number | null = null;
  private activeIndex = 0;
  private lastNavigation = 0;
  private touchStart: { x: number; y: number; time: number } | null = null;
  private lastInteractiveTap: { index: number; time: number } | null = null;
  private artifactPreviewIndex: number | null = null;
  private musicEnabled = false;
  private audioStarting = false;
  private musicManuallyDisabled = false;
  private previousPortalReady = false;
  private portalReadySoundTimer: number | null = null;
  private tutorialComplete = hasCompletedPortalTutorial();
  private cardTapTutorialComplete = hasCompletedCardTapTutorial();
  private cardTapCoachTimer: number | null = null;
  private quietMode = false;
  private readonly platformReady: Promise<void>;

  constructor() {
    this.platformReady = hostPlatform.initialize();
    hostPlatform.configureLinks(this.homeButton, this.supportButton);

    this.music.src = musicUrl;
    this.music.volume = 0.16;
    // The soundtrack is not needed to render the loader and browsers cannot
    // play it before a user gesture anyway. Fetch it only when audio unlocks.
    this.music.preload = 'none';
    this.music.setAttribute('playsinline', '');
    this.cinematicAudio.attachMediaElement(this.music);

    this.world = new GameWorld(this.canvas, allGames, detectQuality(), {
      onProgress: (value) => this.forgeLoader.setProgress(this.loaderDemo ? value * 0.62 : value),
      onSelect: (index) => this.select(index),
      onJourney: (index) => {
        // Hide the coach before selecting the destination. setActive() can
        // publish a fresh cold portal state synchronously during the move.
        this.completePortalTutorial();
        const previous = this.activeIndex;
        this.cinematicAudio.journey(index);
        this.select(index, 'space');
        if (this.activeIndex !== previous) void this.teleportCounter.recordTeleport();
      },
      onActivate: (index) => this.openGame(index),
      onImpact: (power) => this.playImpact(power),
      onPortalState: (state) => this.renderPortalState(state),
      onSceneDirection: (direction) => {
        this.cinematicAudio.update(direction);
        this.world.setAudioEnergy(this.cinematicAudio.getBands());
        const targetMusicVolume = direction.phase === 'ready-quiet'
          ? 0.025
          : direction.phase === 'travel'
            ? 0.1
            : direction.phase === 'arrival'
              ? 0.13
              : 0.16;
        this.music.volume += (targetMusicVolume - this.music.volume) * 0.085;
      },
      onArrival: (index) => this.cinematicAudio.arrival(index),
      onSecretHint: (level) => {
        this.cinematicAudio.secretHint(level);
        this.showSecretHint(level);
      },
    }, {
      portalProgressKey: hostPlatform.localStorageKey('wanderhaym.portalTeleports.v2'),
      legacyPortalProgressKeys: hostPlatform.kind === 'ok' ? [] : ['wanderhaym.portalTeleports.v1'],
      onPortalProgressChange: (value) => {
        void hostPlatform.writeCloudValue(PORTAL_CLOUD_KEY, value);
      },
      isPortalDestinationAvailable: (game) => hostPlatform.canOpenMiniApp(game.okAppId),
    });
    try {
      const quietPreference = localStorage.getItem(hostPlatform.localStorageKey('wanderhaym.effects.v1'))
        ?? (hostPlatform.kind === 'ok' ? null : localStorage.getItem('wanderhaym.effects.v1'));
      this.quietMode = quietPreference === 'quiet'
        || matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      this.quietMode = matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    this.world.setQuietMode(this.quietMode);
    this.updateQuietButton();
    if (this.tutorialComplete) this.hidePortalTutorial();

    this.teleportCounter.subscribe((state) => this.renderTeleportCounter(state));

    this.createNavigation();
    this.bindEvents();
    this.renderGame();
    window.Wanderhaym3D = {
      getState: () => this.world.getDiagnostics(),
      next: () => this.navigate(1),
      previous: () => this.navigate(-1),
      hit: () => this.world.hit(),
      select: (index) => this.select(index),
    };
  }

  async start(): Promise<void> {
    try {
      await this.platformReady;
      const cloudProgress = await hostPlatform.readCloudValue(PORTAL_CLOUD_KEY);
      const mergedProgress = this.world.mergePortalProgress(cloudProgress);
      if (hostPlatform.kind !== 'web' && mergedProgress !== cloudProgress) {
        void hostPlatform.writeCloudValue(PORTAL_CLOUD_KEY, mergedProgress);
      }
      // The loader frames decode alongside the WebGL world. They share the
      // same optimized URLs, so the browser downloads each texture only once
      // without delaying world initialization behind a separate preload gate.
      await this.world.initialize();
      if (this.loaderDemo) await new Promise<void>((resolve) => window.setTimeout(resolve, 6500));
      this.forgeLoader.setProgress(1);
      await this.forgeLoader.complete();
      this.loader.classList.add('is-hidden');
    } catch (error) {
      console.error('Could not initialize Wanderhaym 3D', error);
      this.forgeLoader.fail('Кузня остановлена', 'Обнови страницу или включи WebGL');
    }
  }

  private createNavigation(): void {
    this.progress.replaceChildren(
      ...games.map((game, index) => {
        const marker = document.createElement('i');
        marker.title = game.title;
        marker.classList.toggle('is-active', index === this.activeIndex);
        return marker;
      }),
    );

    games.forEach((game, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = game.title;
      button.addEventListener('click', () => this.select(index));
      this.accessibleGames.append(button);
    });
  }

  private bindEvents(): void {
    required<HTMLButtonElement>('#previousButton').addEventListener('click', () => this.navigate(-1));
    required<HTMLButtonElement>('#nextButton').addEventListener('click', () => this.navigate(1));
    this.gameLaunchButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.hideCardTapCoach();
        this.lastInteractiveTap = null;
        this.unlockAudio();
        this.openGame(this.activeIndex);
      });
    });
    this.soundButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleMusic();
    });
    this.quietButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.quietMode = !this.quietMode;
      this.world.setQuietMode(this.quietMode);
      try {
        localStorage.setItem(
          hostPlatform.localStorageKey('wanderhaym.effects.v1'),
          this.quietMode ? 'quiet' : 'cinematic',
        );
      } catch {
        // Session-only mode is still useful when storage is unavailable.
      }
      this.updateQuietButton();
    });

    addEventListener('resize', () => this.world.resize(), { passive: true });
    addEventListener('pointermove', (event) => this.world.setPointer(event.clientX, event.clientY), { passive: true });
    addEventListener('pointerdown', (event) => {
      if (event.target instanceof Node && this.soundButton.contains(event.target)) return;
      this.world.setPointer(event.clientX, event.clientY);
      this.unlockAudio();
    }, { passive: true });
    addEventListener('touchstart', (event) => {
      if (event.target instanceof Node && this.soundButton.contains(event.target)) return;
      this.unlockAudio();
    }, { passive: true });
    addEventListener('keydown', (event) => {
      this.unlockAudio();
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') this.navigate(1);
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') this.navigate(-1);
      if (event.key.toLowerCase() === 'q') {
        this.quietButton.click();
      }
      if (event.key === ' ' && event.target === document.body) {
        event.preventDefault();
        this.world.hit();
      }
    });

    addEventListener('wheel', (event) => {
      if (Math.abs(event.deltaY) < 8) return;
      const now = performance.now();
      if (now - this.lastNavigation < 680) return;
      this.lastNavigation = now;
      this.navigate(event.deltaY > 0 ? 1 : -1);
    }, { passive: true });

    this.canvas.addEventListener('pointerdown', (event) => {
      this.touchStart = { x: event.clientX, y: event.clientY, time: performance.now() };
      this.world.beginCoreHold(event.clientX, event.clientY);
    });
    this.canvas.addEventListener('pointerup', (event) => {
      const coreHoldTriggered = this.world.endCoreHold();
      const start = this.touchStart;
      this.touchStart = null;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (coreHoldTriggered && Math.hypot(dx, dy) < 38) return;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
        this.hideCardTapCoach();
        this.lastInteractiveTap = null;
        this.artifactPreviewIndex = null;
        this.world.clearPointerInteraction();
        this.navigate(dx < 0 ? 1 : -1);
        return;
      }
      if (performance.now() - start.time < 850 && Math.hypot(dx, dy) < 32) {
        if (event.pointerType === 'touch' && this.world.touchArtifactPreview(event.clientX, event.clientY)) {
          const travel = this.artifactPreviewIndex === this.activeIndex;
          this.artifactPreviewIndex = travel ? null : this.activeIndex;
          this.lastInteractiveTap = null;
          if (travel) this.world.pick(event.clientX, event.clientY);
          return;
        }
        if (event.pointerType === 'touch' && this.world.touchInteractiveCover(event.clientX, event.clientY)) {
          this.artifactPreviewIndex = null;
          const now = performance.now();
          // A touch reveal stays armed until the visitor taps the same card
          // again or navigates away. This is a deliberate two-step action,
          // not a rushed operating-system double tap.
          const activate = this.lastInteractiveTap?.index === this.activeIndex;
          this.lastInteractiveTap = activate ? null : { index: this.activeIndex, time: now };
          if (activate) {
            this.hideCardTapCoach();
            this.world.pick(event.clientX, event.clientY);
          } else {
            this.showCardTapCoach(event.clientX, event.clientY);
          }
          return;
        }
        this.lastInteractiveTap = null;
        this.artifactPreviewIndex = null;
        if (event.pointerType === 'touch') this.world.clearPointerInteraction();
        const selectedCard = this.world.pick(event.clientX, event.clientY);
        if (!selectedCard) this.world.hit();
      }
    });
    this.canvas.addEventListener('pointercancel', () => {
      this.hideCardTapCoach();
      this.world.endCoreHold();
      this.touchStart = null;
      this.artifactPreviewIndex = null;
      this.world.clearPointerInteraction();
    });
    this.canvas.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') {
        this.world.endCoreHold();
        this.world.clearPointerInteraction();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.music.pause();
        this.cinematicAudio.setEnabled(false);
      } else if (this.musicEnabled) {
        this.cinematicAudio.setEnabled(true);
        void this.music.play().catch(() => {
          this.musicEnabled = false;
          this.updateSoundButton();
        });
      }
    });
  }

  private select(index: number, transition: 'slide' | 'space' = 'slide'): void {
    this.hideCardTapCoach();
    const normalized = (index + allGames.length) % allGames.length;
    if (normalized === this.activeIndex) return;
    this.artifactPreviewIndex = null;
    this.activeIndex = normalized;
    this.world.setActive(this.activeIndex, false, transition);
    this.renderGame();
    if (transition === 'slide') this.world.hit(false);
  }

  private navigate(direction: number): void {
    const publicIndex = this.activeIndex >= games.length
      ? (direction > 0 ? 0 : games.length - 1)
      : (this.activeIndex + direction + games.length) % games.length;
    this.select(publicIndex);
  }

  private openGame(index: number): void {
    const game = allGames[index];
    void hostPlatform.openMiniApp(game.appId, game.okAppId).then((opened) => {
      if (opened) return;
      this.interactionCoach.setAttribute('aria-hidden', 'false');
      this.interactionCoach.dataset.state = 'secret';
      this.interactionCoach.textContent = hostPlatform.kind === 'ok'
        ? 'Этот мир пока недоступен в Одноклассниках'
        : 'Не удалось открыть мир — попробуй ещё раз';
      window.setTimeout(() => {
        if (this.tutorialComplete) this.hidePortalTutorial();
      }, 3200);
    });
  }

  private renderGame(): void {
    const game = allGames[this.activeIndex];
    this.cinematicAudio.setWorld(game.profile);
    document.documentElement.style.setProperty('--accent', game.accent);
    this.title.textContent = game.title;
    this.description.textContent = game.description;
    this.tag.textContent = game.tag;
    this.gameLaunchLabel.textContent = `Играть в «${game.title}»`;
    this.gameLaunchButtons.forEach((button) => button.setAttribute('aria-label', `Играть в «${game.title}»`));
    [...this.progress.children].forEach((marker, index) => marker.classList.toggle('is-active', index === this.activeIndex));
    this.ui.classList.remove('is-shifting');
    requestAnimationFrame(() => this.ui.classList.add('is-shifting'));
  }

  private renderPortalState(state: {
    heat: number;
    ready: boolean;
    destination: string;
    hits: number;
    requiredHits: number;
  }): void {
    if (state.ready && !this.previousPortalReady) {
      if (this.portalReadySoundTimer !== null) window.clearTimeout(this.portalReadySoundTimer);
      this.portalReadySoundTimer = window.setTimeout(() => {
        if (this.previousPortalReady) this.cinematicAudio.portalReady();
        this.portalReadySoundTimer = null;
      }, 280);
    } else if (!state.ready && this.portalReadySoundTimer !== null) {
      window.clearTimeout(this.portalReadySoundTimer);
      this.portalReadySoundTimer = null;
    }
    this.previousPortalReady = state.ready;
    const percent = Math.round(state.heat * 100);
    this.portalHud.dataset.state = state.ready ? 'ready' : percent > 2 ? 'heating' : 'cold';
    this.portalState.textContent = state.ready
      ? 'ПОРТАЛ ОТКРЫТ'
      : percent > 2
        ? 'НАГРЕВ ЯДРА'
        : 'РАЗОГРЕЙ ЯДРО';
    this.portalHeatValue.textContent = `${state.hits}/${state.requiredHits}`;
    this.portalHeatBar.style.width = `${percent}%`;
    // Keep the destination visible from the first frame. The cover inside
    // the paw is deliberately subtle while the portal is cold, so hiding
    // its title made the previous world's card look like the destination.
    this.portalDestination.textContent = `→ ${state.destination}`;
    if (!this.tutorialComplete) {
      this.interactionCoach.dataset.state = state.ready ? 'ready' : state.hits > 0 ? 'heating' : 'cold';
      this.interactionCoach.textContent = state.ready
        ? 'Лапа-портал открыта — нажми на ядро'
        : state.hits > 0
          ? 'Продолжай ковать — лапа собирается'
          : 'Нажми на ядро: кот начнёт ковать портал';
    }
  }

  private showCardTapCoach(clientX: number, clientY: number): void {
    if (this.cardTapTutorialComplete) return;
    this.cardTapTutorialComplete = true;
    const viewportPadding = 12;
    const halfWidth = Math.min(
      this.cardTapCoach.offsetWidth / 2,
      innerWidth / 2 - viewportPadding,
    );
    const coachHeight = this.cardTapCoach.offsetHeight;
    const coachX = Math.max(
      viewportPadding + halfWidth,
      Math.min(innerWidth - viewportPadding - halfWidth, clientX),
    );
    const coachY = Math.max(
      viewportPadding,
      Math.min(innerHeight - viewportPadding - coachHeight, clientY + 20),
    );
    this.cardTapCoach.style.setProperty('--card-coach-x', `${coachX}px`);
    this.cardTapCoach.style.setProperty('--card-coach-y', `${coachY}px`);
    this.cardTapCoach.dataset.state = 'visible';
    this.cardTapCoach.setAttribute('aria-hidden', 'false');
    try {
      localStorage.setItem(CARD_TAP_TUTORIAL_KEY, 'complete');
    } catch {
      // Showing the hint once per session is still useful without storage.
    }
    if (this.cardTapCoachTimer !== null) window.clearTimeout(this.cardTapCoachTimer);
    this.cardTapCoachTimer = window.setTimeout(() => this.hideCardTapCoach(), 3600);
  }

  private hideCardTapCoach(): void {
    this.cardTapCoach.dataset.state = 'hidden';
    this.cardTapCoach.setAttribute('aria-hidden', 'true');
    if (this.cardTapCoachTimer !== null) {
      window.clearTimeout(this.cardTapCoachTimer);
      this.cardTapCoachTimer = null;
    }
  }

  private completePortalTutorial(): void {
    this.tutorialComplete = true;
    this.hidePortalTutorial();
    try {
      localStorage.setItem(PORTAL_TUTORIAL_KEY, 'complete');
    } catch {
      // The current session still stays clean when storage is unavailable.
    }
  }

  private hidePortalTutorial(): void {
    this.interactionCoach.dataset.state = 'done';
    this.interactionCoach.textContent = '';
    this.interactionCoach.setAttribute('aria-hidden', 'true');
  }

  private showSecretHint(level: number): void {
    const remaining = Math.max(1, 10 - level);
    this.interactionCoach.setAttribute('aria-hidden', 'false');
    this.interactionCoach.dataset.state = 'secret';
    this.interactionCoach.textContent = remaining <= 2
      ? 'Скрытая кузница уже слышит твои удары…'
      : 'В глубине миров отозвался тайный металл';
    window.setTimeout(() => {
      if (this.tutorialComplete) this.hidePortalTutorial();
    }, 3200);
  }

  private renderTeleportCounter(state: TeleportCounterState): void {
    this.teleportCounterElement.dataset.state = state.status;
    if (state.total === null) {
      this.teleportCounterValue.textContent = state.status === 'connecting' ? '…' : '—';
      return;
    }
    const increased = this.teleportTotal !== null && state.total > this.teleportTotal;
    this.teleportTotal = state.total;
    this.teleportCounterValue.textContent = state.total.toLocaleString('ru-RU');
    if (increased) {
      this.teleportCounterElement.classList.remove('is-pop');
      requestAnimationFrame(() => this.teleportCounterElement.classList.add('is-pop'));
      window.setTimeout(() => this.teleportCounterElement.classList.remove('is-pop'), 380);
    }
  }

  private unlockAudio(): void {
    this.cinematicAudio.unlock();
    if (this.musicManuallyDisabled || this.musicEnabled || this.audioStarting) return;
    this.startMusic();
  }

  private toggleMusic(): void {
    if (this.musicEnabled || !this.music.paused) {
      this.musicManuallyDisabled = true;
      this.musicEnabled = false;
      this.music.pause();
      this.cinematicAudio.setEnabled(false);
      this.updateSoundButton();
      return;
    }
    this.musicManuallyDisabled = false;
    this.startMusic();
  }

  private startMusic(): void {
    if (this.audioStarting) return;
    this.audioStarting = true;
    this.music.muted = false;
    this.music.volume = 0.16;
    void this.music.play().then(() => {
      this.musicEnabled = true;
      this.cinematicAudio.setEnabled(true);
      this.updateSoundButton();
    }).catch(() => {
      this.musicEnabled = false;
      this.cinematicAudio.setEnabled(false);
      this.updateSoundButton();
    }).finally(() => {
      this.audioStarting = false;
    });
  }

  private updateSoundButton(): void {
    this.soundButton.setAttribute('aria-pressed', String(this.musicEnabled));
    this.soundButton.setAttribute('aria-label', this.musicEnabled ? 'Выключить музыку' : 'Включить музыку');
  }

  private updateQuietButton(): void {
    this.quietButton.setAttribute('aria-pressed', String(this.quietMode));
    this.quietButton.setAttribute('aria-label', this.quietMode ? 'Включить кинематографичные эффекты' : 'Включить спокойные эффекты');
    const label = this.quietButton.querySelector<HTMLElement>('span:last-child');
    if (label) label.textContent = this.quietMode ? 'Спокойно' : 'Эффекты';
  }

  private playImpact(power = 1): void {
    // Background WebGL preparation must not add invisible hits to the splash.
    if (!this.loader.classList.contains('is-hidden')) return;
    this.cinematicAudio.impact(power);
    playAppImpact('world', 0.065);
  }
}
