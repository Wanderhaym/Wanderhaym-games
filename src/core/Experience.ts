import musicUrl from '../../assets/music.mp3?url';
import hammerUrl from '../../assets/mascot/hammer-hit.wav?url';
import { games } from '../data/games';
import { detectQuality } from './quality';
import { GameWorld } from '../world/GameWorld';
import { TeleportCounter, type TeleportCounterState } from '../services/TeleportCounter';

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

export class Experience {
  private readonly canvas = required<HTMLCanvasElement>('#world');
  private readonly loader = required<HTMLElement>('#loader');
  private readonly loaderBar = required<HTMLElement>('#loaderBar');
  private readonly loaderValue = required<HTMLElement>('#loaderValue');
  private readonly ui = required<HTMLElement>('#ui');
  private readonly title = required<HTMLElement>('#gameTitle');
  private readonly description = required<HTMLElement>('#gameDescription');
  private readonly tag = required<HTMLElement>('#gameTag');
  private readonly progress = required<HTMLElement>('#progress');
  private readonly accessibleGames = required<HTMLElement>('#accessibleGames');
  private readonly soundButton = required<HTMLButtonElement>('#soundButton');
  private readonly portalHud = required<HTMLElement>('#portalHud');
  private readonly portalState = required<HTMLElement>('#portalState');
  private readonly portalHeatValue = required<HTMLElement>('#portalHeatValue');
  private readonly portalHeatBar = required<HTMLElement>('#portalHeatBar');
  private readonly portalDestination = required<HTMLElement>('#portalDestination');
  private readonly teleportCounterElement = required<HTMLElement>('#teleportCounter');
  private readonly teleportCounterValue = required<HTMLElement>('#teleportCounterValue');
  private readonly music = required<HTMLAudioElement>('#music');
  private readonly hammerAudio = new Audio(hammerUrl);
  private readonly teleportCounter = new TeleportCounter();
  private readonly world: GameWorld;
  private teleportTotal: number | null = null;
  private activeIndex = 0;
  private lastNavigation = 0;
  private touchStart: { x: number; y: number; time: number } | null = null;
  private lastInteractiveTap: { index: number; time: number } | null = null;
  private artifactPreviewIndex: number | null = null;
  private musicEnabled = false;
  private audioUnlocked = false;
  private audioStarting = false;
  private musicManuallyDisabled = false;

  constructor() {
    this.music.src = musicUrl;
    this.music.volume = 0.16;
    this.music.preload = 'auto';
    this.music.setAttribute('playsinline', '');
    this.music.load();
    this.hammerAudio.volume = 0.065;
    this.hammerAudio.preload = 'auto';

    this.world = new GameWorld(this.canvas, games, detectQuality(), {
      onProgress: (value) => this.setLoading(value),
      onSelect: (index) => this.select(index),
      onJourney: (index) => {
        const previous = this.activeIndex;
        this.select(index, 'space');
        if (this.activeIndex !== previous) void this.teleportCounter.recordTeleport();
      },
      onActivate: (index) => this.openGame(index),
      onImpact: () => this.playImpact(),
      onPortalState: (state) => this.renderPortalState(state),
    });

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
      await this.world.initialize();
      this.setLoading(1);
      window.setTimeout(() => this.loader.classList.add('is-hidden'), 420);
    } catch (error) {
      console.error('Could not initialize Wanderhaym 3D', error);
      this.loader.querySelector('h1')!.textContent = 'Не удалось запустить 3D';
      this.loaderValue.textContent = 'Обнови страницу или включи WebGL';
      this.loader.classList.add('has-error');
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
    this.soundButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleMusic();
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
    });
    this.canvas.addEventListener('pointerup', (event) => {
      const start = this.touchStart;
      this.touchStart = null;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
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
          const activate = this.lastInteractiveTap?.index === this.activeIndex
            && now - this.lastInteractiveTap.time < 950;
          this.lastInteractiveTap = activate ? null : { index: this.activeIndex, time: now };
          if (activate) this.world.pick(event.clientX, event.clientY);
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
      this.touchStart = null;
      this.artifactPreviewIndex = null;
      this.world.clearPointerInteraction();
    });
    this.canvas.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') this.world.clearPointerInteraction();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.music.pause();
      } else if (this.musicEnabled) {
        void this.music.play().catch(() => {
          this.musicEnabled = false;
          this.updateSoundButton();
        });
      }
    });
  }

  private select(index: number, transition: 'slide' | 'space' = 'slide'): void {
    const normalized = (index + games.length) % games.length;
    if (normalized === this.activeIndex) return;
    this.artifactPreviewIndex = null;
    this.activeIndex = normalized;
    this.world.setActive(this.activeIndex, false, transition);
    this.renderGame();
    if (transition === 'slide') this.world.hit(false);
  }

  private navigate(direction: number): void {
    this.select(this.activeIndex + direction);
  }

  private openGame(index: number): void {
    const game = games[index];
    window.open(`https://vk.com/app${game.appId}`, '_blank', 'noopener,noreferrer');
  }

  private renderGame(): void {
    const game = games[this.activeIndex];
    document.documentElement.style.setProperty('--accent', game.accent);
    this.title.textContent = game.title;
    this.description.textContent = game.description;
    this.tag.textContent = game.tag;
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
    const percent = Math.round(state.heat * 100);
    this.portalHud.dataset.state = state.ready ? 'ready' : percent > 2 ? 'heating' : 'cold';
    this.portalState.textContent = state.ready
      ? 'ПОРТАЛ ОТКРЫТ'
      : percent > 2
        ? 'НАГРЕВ ЯДРА'
        : 'РАЗОГРЕЙ ЯДРО';
    this.portalHeatValue.textContent = `${state.hits}/${state.requiredHits}`;
    this.portalHeatBar.style.width = `${percent}%`;
    this.portalDestination.textContent = state.hits > 0
      ? `→ ${state.destination}`
      : 'СЛУЧАЙНЫЙ МИР';
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

  private setLoading(value: number): void {
    const percent = Math.round(value * 100);
    this.loaderBar.style.width = `${percent}%`;
    this.loaderValue.textContent = `${String(percent).padStart(2, '0')}%`;
  }

  private unlockAudio(): void {
    if (this.musicManuallyDisabled || this.musicEnabled || this.audioStarting) return;
    this.startMusic();
  }

  private toggleMusic(): void {
    if (this.musicEnabled || !this.music.paused) {
      this.musicManuallyDisabled = true;
      this.musicEnabled = false;
      this.music.pause();
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
      this.audioUnlocked = true;
      this.musicEnabled = true;
      this.updateSoundButton();
    }).catch(() => {
      this.musicEnabled = false;
      this.updateSoundButton();
    }).finally(() => {
      this.audioStarting = false;
    });
  }

  private updateSoundButton(): void {
    this.soundButton.setAttribute('aria-pressed', String(this.musicEnabled));
    this.soundButton.setAttribute('aria-label', this.musicEnabled ? 'Выключить музыку' : 'Включить музыку');
  }

  private playImpact(): void {
    if (!this.audioUnlocked) return;
    this.hammerAudio.currentTime = 0;
    void this.hammerAudio.play().catch(() => undefined);
  }
}
