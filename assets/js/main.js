// Интерактивная витрина Wanderhaym Games.
// Данные игр по-прежнему берутся только из window.GAMES_DATA.
(function () {
  'use strict';

  var games = [];
  var panels = [];
  var activeIndex = 0;
  var wheelSum = 0;
  var wheelLocked = false;
  var dragStartX = 0;
  var dragStartY = 0;
  var dragging = false;
  var movedDuringDrag = false;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function gameUrl(appId) {
    return 'https://vk.com/app' + encodeURIComponent(appId);
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function wrappedOffset(index) {
    var length = games.length;
    var offset = index - activeIndex;
    if (length > 2) {
      if (offset > length / 2) offset -= length;
      if (offset < -length / 2) offset += length;
    }
    return offset;
  }

  function getEffectMeta(game) {
    var title = String(game && game.title || '').toLowerCase();
    var tag = String(game && game.tag || '').toLowerCase();
    var text = title + ' ' + tag;

    if (text.indexOf('домино') !== -1) return { variant: 'domino', accent: '#ffd76a', accentSoft: '#ffb347' };
    if (text.indexOf('цеп') !== -1 || text.indexOf('реакц') !== -1) return { variant: 'pulse', accent: '#77ffc7', accentSoft: '#44e6a6' };
    if (text.indexOf('правда') !== -1 || text.indexOf('лож') !== -1) return { variant: 'truth', accent: '#88a8ff', accentSoft: '#6e90ff' };
    if (text.indexOf('voice') !== -1 || text.indexOf('голос') !== -1) return { variant: 'voice', accent: '#ff8ae2', accentSoft: '#d56dff' };
    if (text.indexOf('генератор') !== -1 || text.indexOf('иде') !== -1) return { variant: 'idea', accent: '#ffb266', accentSoft: '#ff8f45' };
    if (text.indexOf('совмест') !== -1 || text.indexOf('большой пят') !== -1) return { variant: 'orbit', accent: '#8dffcb', accentSoft: '#52d89b' };
    if (text.indexOf('риск') !== -1 || text.indexOf('свидан') !== -1) return { variant: 'romance', accent: '#ff8fa8', accentSoft: '#ff6588' };
    if (text.indexOf('курить') !== -1 || text.indexOf('здоров') !== -1) return { variant: 'smoke', accent: '#c5d0dd', accentSoft: '#97a5ba' };
    if (text.indexOf('знаешь') !== -1 || text.indexOf('виктор') !== -1 || text.indexOf('тест') !== -1) return { variant: 'quiz', accent: '#9f9dff', accentSoft: '#7b79f1' };
    return { variant: 'spark', accent: '#83ffca', accentSoft: '#62eab8' };
  }

  function effectMarkup(effect) {
    switch (effect.variant) {
      case 'domino': return '<div class="panel-fx panel-fx--domino" aria-hidden="true"><span class="fx-domino d1"></span><span class="fx-domino d2"></span><span class="fx-domino d3"></span><span class="fx-domino d4"></span><span class="fx-domino d5"></span></div>';
      case 'pulse': return '<div class="panel-fx panel-fx--pulse" aria-hidden="true"><span class="fx-ring r1"></span><span class="fx-ring r2"></span><span class="fx-ring r3"></span><span class="fx-pulse-line"></span></div>';
      case 'truth': return '<div class="panel-fx panel-fx--truth" aria-hidden="true"><span class="fx-word w1">TRUE</span><span class="fx-word w2">FALSE</span><span class="fx-word w3">TRUE</span></div>';
      case 'voice': return '<div class="panel-fx panel-fx--voice" aria-hidden="true"><span class="fx-bar b1"></span><span class="fx-bar b2"></span><span class="fx-bar b3"></span><span class="fx-bar b4"></span><span class="fx-bar b5"></span><span class="fx-bar b6"></span></div>';
      case 'idea': return '<div class="panel-fx panel-fx--idea" aria-hidden="true"><span class="fx-chip c1">ЖАНР</span><span class="fx-chip c2">МЕХАНИКА</span><span class="fx-chip c3">ИДЕЯ</span><span class="fx-chip c4">МИКС</span></div>';
      case 'orbit': return '<div class="panel-fx panel-fx--orbit" aria-hidden="true"><span class="fx-core"></span><span class="fx-orbit o1"><i></i></span><span class="fx-orbit o2"><i></i></span><span class="fx-orbit o3"><i></i></span></div>';
      case 'romance': return '<div class="panel-fx panel-fx--romance" aria-hidden="true"><span class="fx-heart h1">❤</span><span class="fx-heart h2">❤</span><span class="fx-heart h3">❤</span><span class="fx-target"></span></div>';
      case 'smoke': return '<div class="panel-fx panel-fx--smoke" aria-hidden="true"><span class="fx-smoke s1"></span><span class="fx-smoke s2"></span><span class="fx-smoke s3"></span><span class="fx-smoke s4"></span></div>';
      case 'quiz': return '<div class="panel-fx panel-fx--quiz" aria-hidden="true"><span class="fx-card q1">?</span><span class="fx-card q2">!</span><span class="fx-card q3">?</span></div>';
      default: return '<div class="panel-fx panel-fx--spark" aria-hidden="true"><span class="fx-spark p1"></span><span class="fx-spark p2"></span><span class="fx-spark p3"></span><span class="fx-spark p4"></span><span class="fx-spark p5"></span></div>';
    }
  }

  function setActive(index) {
    if (!games.length) return;
    activeIndex = (index + games.length) % games.length;
    updateScene();
  }

  function step(direction) {
    setActive(activeIndex + direction);
  }

  function updateScene() {
    panels.forEach(function (panel, index) {
      var offset = wrappedOffset(index);
      var abs = Math.abs(offset);
      var active = index === activeIndex;
      panel.style.setProperty('--offset', offset);
      panel.style.setProperty('--abs', abs);
      panel.style.setProperty('--tiltX', '0deg');
      panel.style.setProperty('--tiltY', '0deg');
      panel.classList.toggle('is-active', active);
      panel.setAttribute('aria-hidden', active ? 'false' : 'true');
      panel.tabIndex = active ? 0 : -1;
    });
    updateDetail();
    updateProgress();
  }

  function updateDetail() {
    var game = games[activeIndex];
    if (!game) return;
    var meta = getEffectMeta(game);
    var indexEl = document.getElementById('detailIndex');
    var tagEl = document.getElementById('detailTag');
    var titleEl = document.getElementById('detailTitle');
    var descriptionEl = document.getElementById('detailDescription');
    var playEl = document.getElementById('playGame');

    document.documentElement.style.setProperty('--active-accent', meta.accent);
    document.documentElement.style.setProperty('--active-accent-soft', meta.accentSoft);
    if (indexEl) indexEl.textContent = pad(activeIndex + 1) + ' / ' + pad(games.length);
    if (tagEl) tagEl.textContent = game.tag || 'Игра';
    if (titleEl) titleEl.textContent = game.title || 'Без названия';
    if (descriptionEl) descriptionEl.textContent = game.description || 'Открой игру и попробуй.';
    if (playEl) {
      playEl.href = gameUrl(game.appId);
      playEl.setAttribute('aria-label', 'Играть: ' + (game.title || 'игра'));
    }
  }

  function updateProgress() {
    var progress = document.getElementById('deckProgress');
    if (!progress) return;
    progress.innerHTML = games.map(function (_, index) {
      return '<span class="progress-dot' + (index === activeIndex ? ' active' : '') + '"></span>';
    }).join('');
  }

  function panelMarkup(game, index) {
    var image = game.icon ? escapeHtml(game.icon) : '';
    var bgStyle = image ? ' style="background-image:url(\'' + image + '\')"' : '';
    var tag = escapeHtml(game.tag || 'VK Mini App');
    var title = escapeHtml(game.title || 'Без названия');
    var effect = getEffectMeta(game);
    var style = ' style="--panel-accent:' + effect.accent + ';--panel-accent-soft:' + effect.accentSoft + ';"';

    return '' +
      '<article class="game-panel" data-index="' + index + '" data-variant="' + effect.variant + '" role="button" aria-label="' + title + '"' + style + '>' +
        '<div class="panel-bg"' + bgStyle + '></div>' +
        effectMarkup(effect) +
        '<div class="panel-shade"></div>' +
        '<div class="panel-noise"></div>' +
        '<div class="panel-top"><span class="panel-number">' + pad(index + 1) + '</span><span class="panel-chip">' + tag + '</span></div>' +
        '<div class="panel-content"><span class="panel-kicker">Wanderhaym Games</span><h3 class="panel-title">' + title + '</h3><span class="panel-cta">Открыть <i>↗</i></span></div>' +
      '</article>';
  }

  function renderGames(source) {
    var deck = document.getElementById('gamesDeck');
    if (!deck) return;
    games = Array.isArray(source) ? source.filter(function (game) { return game && game.appId && game.title; }) : [];
    if (!games.length) {
      deck.innerHTML = '<div class="games-loading">Игры не найдены.</div>';
      return;
    }
    deck.innerHTML = games.map(panelMarkup).join('');
    panels = Array.prototype.slice.call(deck.querySelectorAll('.game-panel'));
    panels.forEach(function (panel, index) {
      panel.addEventListener('click', function () {
        if (movedDuringDrag) return;
        if (index !== activeIndex) { setActive(index); return; }
        window.open(gameUrl(games[index].appId), '_blank', 'noopener');
      });
      panel.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          window.open(gameUrl(games[index].appId), '_blank', 'noopener');
        }
      });
    });
    activeIndex = 0;
    updateScene();
  }

  function setupWheel(scene) {
    scene.addEventListener('wheel', function (event) {
      event.preventDefault();
      if (wheelLocked || !games.length) return;
      wheelSum += Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(wheelSum) < 34) return;
      step(wheelSum > 0 ? 1 : -1);
      wheelSum = 0;
      wheelLocked = true;
      window.setTimeout(function () { wheelLocked = false; }, 430);
    }, { passive: false });
  }

  function setupPointer(scene) {
    scene.addEventListener('pointerdown', function (event) {
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      dragging = true;
      movedDuringDrag = false;
      scene.classList.add('dragging');
      if (scene.setPointerCapture) { try { scene.setPointerCapture(event.pointerId); } catch (_) {} }
    });

    scene.addEventListener('pointermove', function (event) {
      if (dragging) {
        if (Math.abs(event.clientX - dragStartX) > 8 || Math.abs(event.clientY - dragStartY) > 8) movedDuringDrag = true;
        return;
      }
      if (event.pointerType === 'touch') return;
      var active = panels[activeIndex];
      if (!active) return;
      var rect = active.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width - 0.5;
      var y = (event.clientY - rect.top) / rect.height - 0.5;
      x = Math.max(-0.6, Math.min(0.6, x));
      y = Math.max(-0.6, Math.min(0.6, y));
      active.style.setProperty('--tiltX', (-y * 5).toFixed(2) + 'deg');
      active.style.setProperty('--tiltY', (x * 7).toFixed(2) + 'deg');
    });

    function finishDrag(event) {
      if (!dragging) return;
      dragging = false;
      scene.classList.remove('dragging');
      var dx = event.clientX - dragStartX;
      var dy = event.clientY - dragStartY;
      var primary = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (Math.abs(primary) > 42) step(primary < 0 ? 1 : -1);
      var active = panels[activeIndex];
      if (active) {
        active.style.setProperty('--tiltX', '0deg');
        active.style.setProperty('--tiltY', '0deg');
      }
      window.setTimeout(function () { movedDuringDrag = false; }, 0);
    }

    scene.addEventListener('pointerup', finishDrag);
    scene.addEventListener('pointercancel', finishDrag);
    scene.addEventListener('pointerleave', function () {
      if (!dragging) {
        var active = panels[activeIndex];
        if (active) {
          active.style.setProperty('--tiltX', '0deg');
          active.style.setProperty('--tiltY', '0deg');
        }
      }
    });
  }

  function setupControls() {
    var scene = document.getElementById('gamesScene');
    var prev = document.getElementById('prevGame');
    var next = document.getElementById('nextGame');
    var brand = document.querySelector('.brand');
    if (scene) { setupWheel(scene); setupPointer(scene); }
    if (prev) prev.addEventListener('click', function () { step(-1); });
    if (next) next.addEventListener('click', function () { step(1); });
    if (brand) brand.addEventListener('click', function (event) { event.preventDefault(); setActive(0); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown') { event.preventDefault(); step(1); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') { event.preventDefault(); step(-1); }
      else if (event.key === 'Home') { event.preventDefault(); setActive(0); }
      else if (event.key === 'End') { event.preventDefault(); setActive(games.length - 1); }
    });
  }

  function setupMusic() {
    var audio = document.getElementById('bgMusic');
    if (!audio) return;
    audio.volume = 0.05;
    audio.loop = true;
    var started = false;
    function play() {
      if (!started || !audio.paused) return;
      var promise = audio.play();
      if (promise && promise.catch) promise.catch(function () {});
    }
    function startOnce() {
      if (started) return;
      started = true;
      play();
      document.removeEventListener('pointerdown', startOnce);
      document.removeEventListener('keydown', startOnce);
    }
    document.addEventListener('pointerdown', startOnce, { passive: true });
    document.addEventListener('keydown', startOnce);
    document.addEventListener('visibilitychange', function () { if (document.hidden) audio.pause(); else play(); });
    window.addEventListener('pagehide', function () { audio.pause(); });
    window.addEventListener('pageshow', play);
  }

  function init() {
    var year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
    renderGames(window.GAMES_DATA || []);
    setupControls();
    setupMusic();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
