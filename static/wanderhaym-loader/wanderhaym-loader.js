const DEFAULT_ASSET_BASE = new URL('./assets/', import.meta.url);

const POSTER_FRAME_NAMES = [
  'cat-00-idle.webp',
  'platform-idle.webp',
];

const STRIKE_FRAME_NAMES = [
  'cat-01-ready.webp',
  'cat-02-windup.webp',
  'cat-03-swing.webp',
  'cat-04-contact.webp',
  'cat-05-impact.webp',
  'cat-recover.webp',
  'platform-hit.webp',
];

const SECONDARY_FRAME_NAMES = [
  'cat-blink-half.webp',
  'cat-blink.webp',
];

const FRAME_NAMES = [
  ...POSTER_FRAME_NAMES,
  ...STRIKE_FRAME_NAMES,
  ...SECONDARY_FRAME_NAMES,
];

function resolveAsset(base, name) {
  return new URL(name, base).href;
}

function required(root, selector) {
  const match = root.querySelector(selector);
  if (!match) throw new Error(`Не найден элемент заставки: ${selector}`);
  return match;
}

function imageError(name, reason = 'файл не загрузился') {
  return new Error(`Не удалось подготовить кадр ${name}: ${reason}`);
}

function durationOption(value, fallback) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function cancellationError() {
  return new DOMException('Заставка закрыта; подготовка кадров отменена', 'AbortError');
}

function markup(title, presentText) {
  return `
    <div class="wh-loader__embers" data-wh="embers" aria-hidden="true"></div>
    <div class="wh-loader__shell">
      <div class="wh-loader__hero">
        <div class="wh-loader__stage" aria-hidden="true">
          <div class="wh-loader__halo"></div>
          <div class="wh-loader__impact"></div>
          <img class="wh-loader__cat" data-wh="cat" alt="">
          <img class="wh-loader__platform" data-wh="platform" alt="">
          <div class="wh-loader__paw-energy">
            <span class="wh-loader__paw-burst"></span>
            <span class="wh-loader__paw-glyph">
              <i class="wh-loader__paw-pad"></i>
              <i class="wh-loader__paw-toe wh-loader__paw-toe--1"></i>
              <i class="wh-loader__paw-toe wh-loader__paw-toe--2"></i>
              <i class="wh-loader__paw-toe wh-loader__paw-toe--3"></i>
              <i class="wh-loader__paw-toe wh-loader__paw-toe--4"></i>
            </span>
          </div>
          <div class="wh-loader__sparks" data-wh="sparks"></div>
        </div>
        <div class="wh-loader__copy">
          <h1><span>${title}</span></h1>
          <p>${presentText}</p>
        </div>
      </div>
      <div class="wh-loader__track" aria-hidden="true"><i data-wh="bar"></i></div>
      <div class="wh-loader__meta">
        <span data-wh="status">ЗАГРУЖАЮ КУЗНЕЦА</span>
        <strong data-wh="value">00%</strong>
      </div>
      <button class="wh-loader__retry" data-wh="retry" type="button" hidden>ПОВТОРИТЬ</button>
    </div>
    <div class="wh-loader__world-flash" aria-hidden="true"></div>
  `;
}

/**
 * Переносимая заставка Wanderhaym.
 *
 * Минимальное использование:
 *   const loader = new WanderhaymForgeLoader();
 *   loader.setProgress(0.5);
 *   await loader.complete();
 */
export class WanderhaymForgeLoader {
  constructor(options = {}) {
    this.options = options;
    this.assetBase = options.assetBase
      ? new URL(options.assetBase, document.baseURI)
      : DEFAULT_ASSET_BASE;
    this.mount = options.mount ?? document.body;
    this.targetProgress = 0;
    this.forgedProgress = 0;
    this.lastReportedProgress = 0;
    this.strikeCount = 0;
    this.striking = false;
    this.blinking = false;
    this.finalStrikeRequested = false;
    this.finalStrike = false;
    this.completionRequested = false;
    this.completed = false;
    this.failed = false;
    this.failureReason = null;
    this.stalled = false;
    this.destroyed = false;
    this.resourcesReleased = false;
    this.posterSettled = false;
    this.firstStrikeStarted = false;
    this.lastStrikeProgress = 0;
    this.nextStrikeAt = 0;
    this.strikeWakeTimer = null;
    this.posterAssetsReady = false;
    this.strikeAssetsReady = false;
    this.secondaryAssetsReady = false;
    this.audioReady = false;
    this.audioFailed = false;
    this.networkSlow = false;
    this.assetFailure = null;
    this.timers = [];
    this.blinkTimer = null;
    this.slowConnectionTimer = null;
    this.stallTimer = null;
    this.completionFallbackTimer = null;
    this.completionPromise = null;
    this.completeResolve = null;
    this.completeReject = null;
    this.preloadedImages = new Map();
    this.imagePromises = new Map();
    this.assetAbort = new AbortController();
    this.paintFrames = new Set();
    this.firstStrikeDone = new Promise((resolve, reject) => {
      this.resolveFirstStrike = resolve;
      this.rejectFirstStrike = reject;
    });
    void this.firstStrikeDone.catch(() => undefined);

    this.slowConnectionDelay = durationOption(options.slowConnectionDelay, 6500);
    this.stallTimeout = durationOption(options.stallTimeout, 30000);
    this.completionAssetGrace = durationOption(options.completionAssetGrace, 1800);

    this.root = document.createElement('div');
    this.root.className = 'wh-loader is-poster-loading';
    this.root.dataset.assetState = 'poster-loading';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.root.style.setProperty('--wh-accent', options.accent ?? '#ff6b18');
    this.root.innerHTML = markup(options.title ?? 'Wanderhaym', options.presentText ?? 'представляет');
    this.mount.append(this.root);

    this.cat = required(this.root, '[data-wh="cat"]');
    this.platform = required(this.root, '[data-wh="platform"]');
    this.bar = required(this.root, '[data-wh="bar"]');
    this.value = required(this.root, '[data-wh="value"]');
    this.status = required(this.root, '[data-wh="status"]');
    this.sparks = required(this.root, '[data-wh="sparks"]');
    this.embers = required(this.root, '[data-wh="embers"]');
    this.retry = required(this.root, '[data-wh="retry"]');

    this.frames = Object.fromEntries(
      FRAME_NAMES.map((name) => [name, resolveAsset(this.assetBase, name)]),
    );

    this.cat.decoding = 'async';
    this.platform.decoding = 'async';
    this.cat.fetchPriority = 'high';
    this.platform.fetchPriority = 'high';
    this.cat.src = this.frames['cat-00-idle.webp'];
    this.platform.src = this.frames['platform-idle.webp'];

    this.hitAudio = new Audio();
    this.hitAudio.preload = 'auto';
    this.hitAudio.volume = options.soundVolume ?? 0.075;
    this.handleAudioReady = () => {
      if (this.resourcesReleased) return;
      this.audioReady = this.hitAudio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    };
    this.handleAudioError = () => {
      if (this.resourcesReleased) return;
      this.audioFailed = true;
      this.audioReady = false;
    };
    this.hitAudio.addEventListener('loadeddata', this.handleAudioReady);
    this.hitAudio.addEventListener('canplaythrough', this.handleAudioReady);
    this.hitAudio.addEventListener('error', this.handleAudioError);
    this.hitAudio.src = resolveAsset(this.assetBase, 'hammer-hit.wav');
    this.hitAudio.load();

    this.handleRetry = () => window.location.reload();
    this.retry.addEventListener('click', this.handleRetry);
    this.handleConnectionChange = () => this.renderStatus();
    window.addEventListener('online', this.handleConnectionChange);
    window.addEventListener('offline', this.handleConnectionChange);

    // Загружаем только постер. После него — кадры удара, и лишь затем моргание.
    // Так второстепенные кадры не отнимают сеть у первого видимого появления.
    this.posterReady = Promise.all([
      this.waitForVisibleImage(this.cat, 'cat-00-idle.webp'),
      this.waitForVisibleImage(this.platform, 'platform-idle.webp'),
    ]).then(() => {
      this.checkAssetActivity();
      this.posterAssetsReady = true;
      this.root.classList.remove('is-poster-loading');
      this.root.classList.add('is-poster-ready');
      this.root.dataset.assetState = 'poster-ready';
      this.root.dataset.state = 'rest';
      this.renderProgress();
      // Две отрисовки дают браузеру показать постер. Затем 320 мс появления
      // и 180 мс спокойной позы: замах не теряется в полупрозрачном кадре.
      this.afterPaint(() => {
        this.after(this.reducedMotion() ? 0 : 500, () => {
          if (this.completed || this.failed) return;
          this.posterSettled = true;
          this.requestStrike();
        });
      });
    });

    this.strikeReady = this.posterReady
      .then(() => this.loadFrameGroup(STRIKE_FRAME_NAMES, 'high'))
      .then(() => {
        this.checkAssetActivity();
        this.strikeAssetsReady = true;
        this.root.classList.add('are-strike-assets-ready');
        this.root.dataset.assetState = 'strike-ready';
        this.renderProgress();
        if (this.reducedMotion()) this.resolveFirstStrike?.();
        this.requestStrike();
      });

    this.secondaryReady = this.strikeReady
      .then(() => this.firstStrikeDone)
      .then(() => this.loadFrameGroup(SECONDARY_FRAME_NAMES, 'low'))
      .then(() => {
        this.checkAssetActivity();
        this.secondaryAssetsReady = true;
        this.root.dataset.assetState = 'complete';
        if (!this.striking && this.targetProgress <= this.forgedProgress + 0.001) {
          this.scheduleBlink();
        }
      });

    this.assetsReady = Promise.all([
      this.posterReady,
      this.strikeReady,
      this.secondaryReady,
    ]).then(() => undefined);

    // Внутренняя обработка не превращает реальные 404/битые кадры в успех:
    // public ready() по-прежнему отклоняется, а сама заставка переходит в
    // безопасный статичный режим и не удерживает уже готовую игру.
    void this.posterReady.catch((error) => this.handleAssetFailure(error, 'poster'));
    void this.strikeReady.catch((error) => {
      if (this.posterAssetsReady) this.handleAssetFailure(error, 'strike');
    });
    void this.secondaryReady.catch((error) => {
      if (this.strikeAssetsReady) this.handleAssetFailure(error, 'secondary');
    });
    void this.assetsReady.catch(() => undefined);

    this.createEmbers();
    this.renderProgress();
    this.startWatchdogs();
  }

  /** Передать прогресс от 0 до 1. Прогресс никогда не движется назад. */
  setProgress(value) {
    if (this.destroyed || this.completed || this.failed) return;
    const normalized = Math.min(1, Math.max(0, Number(value) || 0));
    const advanced = normalized > this.lastReportedProgress + 0.001;
    this.lastReportedProgress = Math.max(this.lastReportedProgress, normalized);
    this.targetProgress = Math.max(this.targetProgress, normalized);
    if (advanced && !this.completionRequested) {
      this.recoverFromStall();
      this.startWatchdogs();
    }
    // Полоса следует реальным данным, а удары отмечают крупные этапы.
    // До явного complete() максимум 99%: готовность одного ресурса не равна
    // готовности всей игры.
    this.forgedProgress = this.completionRequested ? 1 : Math.min(0.99, this.targetProgress);
    this.renderProgress();
    this.requestStrike();
  }

  /**
   * Дождаться всех кадров. Promise отклоняется при 404, повреждённом файле
   * или изображении без декодируемых пикселей.
   */
  ready() {
    return this.assetsReady;
  }

  /**
   * Завершить заставку финальным ударом и раскрытием лапы.
   * Если критические кадры не пришли вовремя, готовая игра откроется через
   * безопасный короткий переход без невидимого удара и запоздалого звука.
   */
  complete() {
    if (this.completionPromise) return this.completionPromise;
    this.completionPromise = new Promise((resolve, reject) => {
      this.completeResolve = resolve;
      this.completeReject = reject;
    });
    void this.completionPromise.catch(() => undefined);

    if (this.destroyed || this.failed) {
      this.completeReject?.(this.failureReason ?? cancellationError());
      return this.completionPromise;
    }

    this.completionRequested = true;
    this.targetProgress = 1;
    this.finalStrikeRequested = true;
    this.recoverFromStall();
    this.clearWatchdogs();
    this.networkSlow = false;
    this.root.classList.remove('is-network-slow');

    if (this.reducedMotion()) {
      this.forgedProgress = 1;
      this.renderProgress();
      this.finish({ safe: true });
      return this.completionPromise;
    }

    this.scheduleCompletionFallback();
    if (this.striking) this.promoteCurrentStrikeToFinal();
    else this.requestStrike();

    return this.completionPromise;
  }

  /** Показать понятное сообщение, если сама игра не загрузилась. */
  fail(title = 'КУЗНЯ ОСТАНОВЛЕНА', message = 'Обновите страницу и попробуйте снова') {
    if (this.destroyed || this.completed) return;
    this.failed = true;
    this.failureReason = new Error(`${title}: ${message}`);
    this.clearTimers();
    this.assetAbort.abort();
    this.rejectFirstStrike?.(cancellationError());
    this.completeReject?.(this.failureReason);
    this.hitAudio.pause();
    this.root.classList.add('has-error');
    this.root.classList.remove('is-network-slow');
    required(this.root, '.wh-loader__copy h1').textContent = title;
    this.status.textContent = message;
    this.value.textContent = 'ОШИБКА';
    this.retry.hidden = false;
    if (this.posterAssetsReady) {
      this.cat.src = this.frames['cat-00-idle.webp'];
      this.platform.src = this.frames['platform-idle.webp'];
    }
  }

  /** Полностью удалить заставку и освободить таймеры. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.completeReject?.(cancellationError());
    this.releaseResources();
    this.root.remove();
  }

  reducedMotion() {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  checkAssetActivity() {
    if (this.assetAbort.signal.aborted || this.destroyed || this.completed || this.failed) {
      throw cancellationError();
    }
  }

  async confirmImage(image, name) {
    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      throw imageError(name);
    }

    if (typeof image.decode === 'function') {
      try {
        await image.decode();
      } catch (error) {
        // Некоторые старые WebView отклоняют decode() уже отображаемого кадра.
        // Реальную сетевую/файловую ошибку отличаем по отсутствию пикселей.
        if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
          throw imageError(name, error instanceof Error ? error.message : 'ошибка декодирования');
        }
      }
    }

    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      throw imageError(name, 'изображение не содержит видимых пикселей');
    }
  }

  waitForVisibleImage(image, name) {
    return new Promise((resolve, reject) => {
      const signal = this.assetAbort.signal;
      let settled = false;
      const cleanup = () => {
        image.removeEventListener('load', handleLoad);
        image.removeEventListener('error', handleError);
        signal.removeEventListener('abort', handleAbort);
      };
      const settle = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const handleLoad = () => {
        this.confirmImage(image, name).then(() => {
          settle(signal.aborted ? cancellationError() : null);
        }, settle);
      };
      const handleError = () => settle(imageError(name));
      const handleAbort = () => settle(cancellationError());
      if (signal.aborted) { handleAbort(); return; }
      image.addEventListener('load', handleLoad, { once: true });
      image.addEventListener('error', handleError, { once: true });
      signal.addEventListener('abort', handleAbort, { once: true });
      if (image.complete) handleLoad();
    });
  }

  preloadFrame(name, priority) {
    this.checkAssetActivity();
    if (this.imagePromises.has(name)) return this.imagePromises.get(name);

    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = priority;
    this.preloadedImages.set(name, image);
    image.src = this.frames[name];
    const promise = this.waitForVisibleImage(image, name);
    this.imagePromises.set(name, promise);
    return promise;
  }

  async loadFrameGroup(names, priority) {
    this.checkAssetActivity();
    // Не декодируем семь кадров одновременно на слабом телефоне.
    let next = 0;
    let failure = null;
    const worker = async () => {
      while (next < names.length && !failure) {
        this.checkAssetActivity();
        const name = names[next++];
        try {
          await this.preloadFrame(name, priority);
        } catch (error) {
          failure = error;
          throw error;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, names.length) }, worker));
  }

  handleAssetFailure(error, group) {
    if (this.destroyed || this.completed || this.failed || error.name === 'AbortError') return;
    if (!this.assetFailure) this.assetFailure = error;
    this.root.classList.add('has-asset-warning');
    this.root.dataset.assetState = `${group}-failed`;
    this.renderStatus();

    if (this.completionRequested) {
      this.scheduleCompletionFallback();
    }
  }

  requestStrike() {
    if (
      this.destroyed
      || this.completed
      || this.failed
      || !this.strikeAssetsReady
      || !this.posterSettled
      || this.reducedMotion()
      || this.striking
      || this.blinking
    ) return;

    if (this.firstStrikeStarted && !this.completionRequested) {
      if (this.targetProgress - this.lastStrikeProgress < 0.16) return;
      const wait = this.nextStrikeAt - performance.now();
      if (wait > 0) {
        if (this.strikeWakeTimer === null) {
          this.strikeWakeTimer = this.after(wait, () => {
            this.strikeWakeTimer = null;
            this.requestStrike();
          });
        }
        return;
      }
    }

    if (this.blinkTimer !== null) window.clearTimeout(this.blinkTimer);
    this.blinkTimer = null;
    this.firstStrikeStarted = true;
    this.lastStrikeProgress = this.targetProgress;
    this.nextStrikeAt = performance.now() + 1500;
    this.striking = true;
    this.finalStrike = this.finalStrikeRequested;
    if (this.finalStrike) {
      this.clearCompletionFallback();
      this.finalStrikeRequested = false;
      this.root.classList.add('is-final-strike');
    }

    this.renderStatus();
    this.root.dataset.state = 'windup';
    this.cat.src = this.frames['cat-01-ready.webp'];
    this.after(70, () => { this.cat.src = this.frames['cat-02-windup.webp']; });
    this.after(155, () => {
      this.root.dataset.state = 'swing';
      this.cat.src = this.frames['cat-03-swing.webp'];
    });
    this.after(235, () => this.impact());
    this.after(310, () => {
      this.root.dataset.state = 'impact';
      this.cat.src = this.frames['cat-05-impact.webp'];
    });
    this.after(390, () => {
      this.root.dataset.state = 'recover';
      this.cat.src = this.frames['cat-recover.webp'];
      this.platform.src = this.frames['platform-idle.webp'];
      this.root.classList.remove('is-impacting');
    });
    this.after(500, () => {
      this.root.dataset.state = 'settle';
      this.cat.src = this.frames['cat-00-idle.webp'];
      this.root.classList.remove('is-settling');
      void this.root.offsetWidth;
      this.root.classList.add('is-settling');
    });
    this.after(690, () => {
      this.root.classList.remove('is-settling');
      this.root.dataset.state = 'rest';
      this.striking = false;
      this.resolveFirstStrike?.();
      if (this.completionRequested && this.finalStrike) {
        this.finish();
        return;
      }
      if (
        this.secondaryAssetsReady
        && this.strikeCount > 0
        && this.strikeCount % 3 === 0
        && this.forgedProgress < 0.96
      ) {
        this.performBlink(false);
      } else {
        this.scheduleBlink();
        this.requestStrike();
      }
    });
  }

  promoteCurrentStrikeToFinal() {
    if (!this.striking || this.completed || this.failed) return;
    this.clearCompletionFallback();
    this.finalStrikeRequested = false;
    this.finalStrike = true;
    this.forgedProgress = 1;
    this.root.classList.add('is-final-strike');
    this.renderProgress();
  }

  impact() {
    if (this.destroyed || this.completed || this.failed) return;
    this.strikeCount += 1;
    this.lastStrikeProgress = this.targetProgress;
    this.root.dataset.state = 'contact';
    this.root.classList.remove('is-impacting');
    void this.root.offsetWidth;
    this.root.classList.add('is-impacting');
    this.cat.src = this.frames['cat-04-contact.webp'];
    this.platform.src = this.frames['platform-hit.webp'];
    this.spawnSparks();

    // Не запускаем звук отдельно от картинки. Если браузер не успел
    // подготовить WAV, удар остаётся визуальным, а запоздалый звук не догоняет.
    if (this.strikeAssetsReady && this.audioReady && !this.audioFailed) {
      try {
        this.hitAudio.currentTime = 0;
        void this.hitAudio.play().catch(() => undefined);
      } catch {
        // Автовоспроизведение может быть запрещено до первого жеста.
      }
    }

    this.forgedProgress = this.completionRequested ? 1 : Math.min(0.99, this.targetProgress);
    this.renderProgress();
  }

  renderProgress() {
    if (this.completed || this.failed || this.resourcesReleased) return;
    const percent = Math.round(this.forgedProgress * 100);
    this.bar.style.width = `${percent}%`;
    this.root.style.setProperty('--wh-progress', String(this.forgedProgress));
    this.value.textContent = `${String(percent).padStart(2, '0')}%`;
    this.root.dataset.phase = percent >= 100
      ? 'ready'
      : percent >= 70
        ? 'final'
        : percent >= 20
          ? 'assembly'
          : 'ignition';
    this.renderStatus();
  }

  renderStatus() {
    if (this.failed || this.completed) return;
    const percent = Math.round(this.forgedProgress * 100);
    if (this.finalStrike || this.finalStrikeRequested) {
      this.status.textContent = 'ФИНАЛЬНАЯ КОВКА';
    } else if (navigator.onLine === false) {
      this.status.textContent = 'НЕТ СОЕДИНЕНИЯ — ОЖИДАЮ ВОССТАНОВЛЕНИЯ';
    } else if (this.stalled) {
      this.status.textContent = 'ЗАГРУЗКА ЗАДЕРЖАЛАСЬ — МОЖНО ПОДОЖДАТЬ ИЛИ ПОВТОРИТЬ';
    } else if (this.assetFailure && !this.strikeAssetsReady) {
      this.status.textContent = 'БЕРЕЖНЫЙ РЕЖИМ ЗАГРУЗКИ';
    } else if (this.networkSlow) {
      this.status.textContent = 'ЗАГРУЗКА ЗАНИМАЕТ БОЛЬШЕ ВРЕМЕНИ';
    } else if (!this.posterAssetsReady) {
      this.status.textContent = 'ЗАГРУЖАЮ КУЗНЕЦА';
    } else if (!this.strikeAssetsReady) {
      this.status.textContent = 'ГОТОВЛЮ ПЕРВЫЙ УДАР';
    } else if (percent >= 100) {
      this.status.textContent = 'МИР ГОТОВ';
    } else if (percent >= 70) {
      this.status.textContent = 'ФИНАЛЬНАЯ КОВКА';
    } else if (percent >= 20) {
      this.status.textContent = 'СОБИРАЮ МИР';
    } else {
      this.status.textContent = 'РАЗЖИГАЮ ОГОНЬ';
    }
  }

  spawnSparks() {
    const amount = 13 + Math.round(this.forgedProgress * 12);
    for (let index = 0; index < amount; index += 1) {
      const spark = document.createElement('i');
      const angle = -Math.PI * (0.08 + Math.random() * 0.84);
      const distance = 58 + Math.random() * (76 + this.forgedProgress * 70);
      spark.className = 'wh-loader__spark';
      spark.style.setProperty('--spark-x', `${Math.cos(angle) * distance}px`);
      spark.style.setProperty('--spark-y', `${Math.sin(angle) * distance}px`);
      spark.style.setProperty('--spark-size', `${1.5 + Math.random() * 3.5}px`);
      spark.style.setProperty('--spark-delay', `${Math.random() * 55}ms`);
      spark.addEventListener('animationend', () => spark.remove(), { once: true });
      this.sparks.append(spark);
    }
  }

  createEmbers() {
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

  scheduleBlink() {
    if (this.destroyed || this.completed || this.failed || !this.secondaryAssetsReady || this.reducedMotion()) return;
    if (this.blinkTimer !== null) window.clearTimeout(this.blinkTimer);
    this.blinkTimer = window.setTimeout(() => {
      this.blinkTimer = null;
      if (this.striking || this.completed || this.failed) {
        this.scheduleBlink();
        return;
      }
      this.performBlink(Math.random() > 0.72);
    }, 1500 + Math.random() * 2600);
  }

  performBlink(doubleBlink) {
    if (
      this.destroyed
      || this.striking
      || this.completed
      || this.failed
      || this.blinking
      || !this.secondaryAssetsReady
      || this.reducedMotion()
    ) return;
    this.blinking = true;
    this.root.dataset.state = 'blink';
    this.cat.src = this.frames['cat-blink-half.webp'];
    this.after(72, () => { if (!this.striking) this.cat.src = this.frames['cat-blink.webp']; });
    this.after(142, () => { if (!this.striking) this.cat.src = this.frames['cat-blink-half.webp']; });
    this.after(215, () => { if (!this.striking) this.cat.src = this.frames['cat-00-idle.webp']; });
    if (doubleBlink) {
      this.after(330, () => { if (!this.striking) this.cat.src = this.frames['cat-blink-half.webp']; });
      this.after(395, () => { if (!this.striking) this.cat.src = this.frames['cat-blink.webp']; });
      this.after(465, () => { if (!this.striking) this.cat.src = this.frames['cat-00-idle.webp']; });
    }
    this.after(doubleBlink ? 520 : 275, () => {
      this.blinking = false;
      this.root.dataset.state = 'rest';
      this.requestStrike();
      if (!this.striking) this.scheduleBlink();
    });
  }

  startWatchdogs() {
    this.clearWatchdogs();
    if (this.completionRequested || this.destroyed || this.completed || this.failed) return;
    if (this.slowConnectionDelay > 0) {
      this.slowConnectionTimer = window.setTimeout(() => {
        this.slowConnectionTimer = null;
        if (this.destroyed || this.completed || this.failed) return;
        this.networkSlow = true;
        this.root.classList.add('is-network-slow');
        this.renderStatus();
      }, this.slowConnectionDelay);
    }
    this.resetStallWatchdog();
  }

  resetStallWatchdog() {
    if (this.stallTimer !== null) window.clearTimeout(this.stallTimer);
    this.stallTimer = null;
    if (this.stallTimeout <= 0 || this.destroyed || this.completed || this.failed) return;
    this.stallTimer = window.setTimeout(() => {
      this.stallTimer = null;
      if (this.destroyed || this.completed || this.failed) return;
      this.stalled = true;
      this.root.classList.add('is-stalled');
      this.retry.hidden = false;
      this.renderStatus();
    }, this.stallTimeout);
  }

  clearWatchdogs() {
    if (this.slowConnectionTimer !== null) window.clearTimeout(this.slowConnectionTimer);
    if (this.stallTimer !== null) window.clearTimeout(this.stallTimer);
    this.slowConnectionTimer = null;
    this.stallTimer = null;
  }

  recoverFromStall() {
    this.stalled = false;
    this.networkSlow = false;
    this.root.classList.remove('is-stalled', 'is-network-slow');
    this.retry.hidden = true;
    this.renderStatus();
  }

  scheduleCompletionFallback() {
    if (!this.completionRequested || this.failed || this.completionFallbackTimer !== null || this.completed || this.destroyed) return;
    this.completionFallbackTimer = window.setTimeout(() => {
      this.completionFallbackTimer = null;
      if (this.completed || this.destroyed || this.failed) return;
      this.forgedProgress = 1;
      this.finalStrikeRequested = false;
      this.finalStrike = false;
      this.renderProgress();
      this.finish({ safe: true });
    }, this.completionAssetGrace);
  }

  clearCompletionFallback() {
    if (this.completionFallbackTimer !== null) {
      window.clearTimeout(this.completionFallbackTimer);
      this.completionFallbackTimer = null;
    }
  }

  finish({ safe = false } = {}) {
    if (!this.completionRequested || this.destroyed || this.completed || this.failed) return;
    this.forgedProgress = 1;
    this.renderProgress();
    this.completed = true;
    this.clearTimers();
    this.assetAbort.abort();
    this.rejectFirstStrike?.(cancellationError());
    this.root.dataset.state = 'complete';
    this.status.textContent = 'МИР ГОТОВ';
    this.retry.hidden = true;
    this.root.classList.remove('is-network-slow');
    this.root.classList.add(safe ? 'is-safe-opening' : 'is-world-opening');
    const reducedMotion = this.reducedMotion();
    const exitDuration = reducedMotion ? 120 : safe ? 420 : 900;
    this.after(exitDuration, () => {
      this.root.classList.add('is-hidden');
      this.root.setAttribute('aria-hidden', 'true');
      this.releaseResources();
      this.completeResolve?.();
      this.options.onComplete?.();
    });
  }

  after(delay, callback) {
    const timer = window.setTimeout(() => {
      this.timers = this.timers.filter((entry) => entry !== timer);
      if (!this.destroyed) callback();
    }, delay);
    this.timers.push(timer);
    return timer;
  }

  afterPaint(callback) {
    const schedule = (next) => {
      const frame = window.requestAnimationFrame(() => {
        this.paintFrames.delete(frame);
        if (!this.destroyed && !this.completed && !this.failed) next();
      });
      this.paintFrames.add(frame);
    };
    schedule(() => schedule(callback));
  }

  releaseResources() {
    if (this.resourcesReleased) return;
    this.resourcesReleased = true;
    this.clearTimers();
    this.assetAbort.abort();
    this.rejectFirstStrike?.(cancellationError());
    this.resolveFirstStrike = null;
    this.rejectFirstStrike = null;
    window.removeEventListener('online', this.handleConnectionChange);
    window.removeEventListener('offline', this.handleConnectionChange);
    this.retry.removeEventListener('click', this.handleRetry);
    this.hitAudio.removeEventListener('loadeddata', this.handleAudioReady);
    this.hitAudio.removeEventListener('canplaythrough', this.handleAudioReady);
    this.hitAudio.removeEventListener('error', this.handleAudioError);
    this.hitAudio.pause();
    this.hitAudio.removeAttribute('src');
    this.hitAudio.load();
    this.audioReady = false;
    for (const image of this.preloadedImages.values()) image.removeAttribute('src');
    this.preloadedImages.clear();
    this.imagePromises.clear();
    this.cat.removeAttribute('src');
    this.platform.removeAttribute('src');
    this.sparks.replaceChildren();
    this.embers.replaceChildren();
    this.root.replaceChildren();
    this.hitAudio = null;
    this.cat = null;
    this.platform = null;
    this.sparks = null;
    this.embers = null;
    this.retry = null;
    this.bar = null;
    this.value = null;
    this.status = null;
  }

  clearTimers() {
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers = [];
    this.strikeWakeTimer = null;
    this.paintFrames.forEach((frame) => window.cancelAnimationFrame(frame));
    this.paintFrames.clear();
    this.clearWatchdogs();
    this.clearCompletionFallback();
    if (this.blinkTimer !== null) window.clearTimeout(this.blinkTimer);
    this.blinkTimer = null;
    this.blinking = false;
  }
}

export default WanderhaymForgeLoader;
