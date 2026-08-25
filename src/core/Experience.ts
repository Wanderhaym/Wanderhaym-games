import musicUrl from '../../assets/music.mp3?url';
import hammerUrl from '../../assets/mascot/hammer-hit.wav?url';
import { games } from '../data/games';
import { detectQuality } from './quality';
import { GameWorld } from '../world/GameWorld';

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
  private readonly indexLabel = required<HTMLElement>('#gameIndex');
  private readonly play = required<HTMLAnchorElement>('#playButton');
  private readonly progress = required<HTMLElement>('#progress');
  private readonly accessibleGames = required<HTMLElement>('#accessibleGames');
  private readonly soundButton = required<HTMLButtonElement>('#soundButton');
  private readonly music = required<HTMLAudioElement>('#music');
  private readonly hammerAudio = new Audio(hammerUrl);
  private readonly world: GameWorld;
  private activeIndex = 0;
  private lastNavigation = 0;
  private touchStart: { x: number; y: number; time: number } | null = null;
  private musicEnabled = false;
  private audioUnlocked = false;

  constructor() {
    this.music.src = musicUrl;
    this.music.volume = 0.16;
    this.hammerAudio.volume = 0.065;
    this.hammerAudio.preload = 'auto';

    this.world = new GameWorld(this.canvas, games, detectQuality(), {
      onProgress: (value) => this.setLoading(value),
      onSelect: (index) => this.select(index),
      onActivate: (index) => this.openGame(index),
      onImpact: () => this.playImpact(),
    });

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
    required<HTMLButtonElement>('#homeButton').addEventListener('click', () => this.select(0));
    this.soundButton.addEventListener('click', () => this.toggleMusic());

    addEventListener('resize', () => this.world.resize(), { passive: true });
    addEventListener('pointermove', (event) => this.world.setPointer(event.clientX, event.clientY), { passive: true });
    addEventListener('pointerdown', () => this.unlockAudio(), { passive: true, once: true });
    addEventListener('keydown', (event) => {
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
        this.navigate(dx < 0 ? 1 : -1);
        return;
      }
      if (performance.now() - start.time < 700 && Math.hypot(dx, dy) < 18) {
        const selectedCard = this.world.pick(event.clientX, event.clientY);
        if (!selectedCard) this.world.hit();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.music.pause();
      } else if (this.musicEnabled) {
        void this.music.play().catch(() => undefined);
      }
    });
  }

  private select(index: number): void {
    const normalized = (index + games.length) % games.length;
    if (normalized === this.activeIndex) return;
    this.activeIndex = normalized;
    this.world.setActive(this.activeIndex);
    this.renderGame();
    this.world.hit();
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
    this.indexLabel.textContent = `${String(this.activeIndex + 1).padStart(2, '0')} / ${String(games.length).padStart(2, '0')}`;
    this.play.href = `https://vk.com/app${game.appId}`;
    this.play.setAttribute('aria-label', `Играть в «${game.title}» во ВКонтакте`);
    [...this.progress.children].forEach((marker, index) => marker.classList.toggle('is-active', index === this.activeIndex));
    this.ui.classList.remove('is-shifting');
    requestAnimationFrame(() => this.ui.classList.add('is-shifting'));
  }

  private setLoading(value: number): void {
    const percent = Math.round(value * 100);
    this.loaderBar.style.width = `${percent}%`;
    this.loaderValue.textContent = `${String(percent).padStart(2, '0')}%`;
  }

  private unlockAudio(): void {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    this.musicEnabled = true;
    this.updateSoundButton();
    void this.music.play().catch(() => {
      this.musicEnabled = false;
      this.updateSoundButton();
    });
  }

  private toggleMusic(): void {
    this.audioUnlocked = true;
    this.musicEnabled = !this.musicEnabled;
    if (this.musicEnabled) {
      void this.music.play().catch(() => {
        this.musicEnabled = false;
        this.updateSoundButton();
      });
    } else {
      this.music.pause();
    }
    this.updateSoundButton();
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
