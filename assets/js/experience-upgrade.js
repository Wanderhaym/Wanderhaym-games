// Дополнительный слой анимаций для витрины Wanderhaym Games.
// Не меняет GAMES_DATA и базовую механику карусели из main.js.
(function () {
  'use strict';

  var launching = false;
  var launchResetTimer = 0;
  var coverObserver = null;

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function sourceGames() {
    return Array.isArray(window.GAMES_DATA) ? window.GAMES_DATA : [];
  }

  function gameByPanel(panel) {
    if (!panel) return null;
    var index = Number(panel.getAttribute('data-index'));
    var source = sourceGames();
    return Number.isFinite(index) ? source[index] || null : null;
  }

  function gameUrlByPanel(panel) {
    var game = gameByPanel(panel);
    if (!game || !game.appId) return '';
    return 'https://vk.com/app' + encodeURIComponent(game.appId);
  }

  function stringUrl(value) {
    if (typeof value !== 'string') return '';
    var url = value.trim();
    if (/^https?:\/\//i.test(url)) return url;
    if (/^(?:\.\.?\/|\/)?assets\//i.test(url)) return url;
    return '';
  }

  function urlFromSnippet(value) {
    var direct = stringUrl(value);
    if (direct) return direct;
    if (!value || typeof value !== 'object') return '';

    var keys = ['url', 'src', 'image', 'imageUrl', 'image_url', 'photo', 'photoUrl', 'photo_url', 'cover', 'coverUrl', 'cover_url'];
    for (var i = 0; i < keys.length; i += 1) {
      var candidate = stringUrl(value[keys[i]]);
      if (candidate) return candidate;
    }
    return '';
  }

  // Приоритет отдан локальной обложке или «большому сниппету», если такой путь
  // будет добавлен в данные игры. Поддерживаются несколько типичных имён поля,
  // чтобы не привязывать витрину к одному формату источника.
  function explicitLargeCover(game) {
    if (!game) return '';
    var keys = [
      'cover', 'coverUrl', 'cover_url', 'largeCover', 'large_cover',
      'largeImage', 'large_image', 'imageLarge', 'image_large',
      'imageBig', 'image_big', 'largeSnippet', 'large_snippet',
      'bigSnippet', 'big_snippet', 'snippet'
    ];

    for (var i = 0; i < keys.length; i += 1) {
      var candidate = urlFromSnippet(game[keys[i]]);
      if (candidate) return candidate;
    }
    return '';
  }

  // Текущие icon в GAMES_DATA — VK-фото с size=139x139. Просим у того же
  // CDN крупный вариант. Если VK его не отдаст, исходная 139x139 останется.
  function largerVkVariant(url) {
    var source = stringUrl(url);
    if (!source || source.indexOf('vkuserphoto.') === -1) return '';
    if (!/[?&]size=\d+x\d+/i.test(source)) return '';
    return source.replace(/([?&])size=\d+x\d+/i, '$1size=1280x1280');
  }

  function cssUrl(url) {
    return 'url("' + String(url).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '")';
  }

  function installCover(panel) {
    if (!panel || panel.getAttribute('data-cover-upgrade') === 'ready') return;
    var game = gameByPanel(panel);
    var bg = panel.querySelector('.panel-bg');
    if (!game || !bg) return;

    var fallback = stringUrl(game.icon);
    var explicit = explicitLargeCover(game);
    var candidate = explicit || largerVkVariant(fallback);

    panel.setAttribute('data-cover-upgrade', 'ready');
    if (!candidate || candidate === fallback) return;

    var probe = new Image();
    probe.decoding = 'async';
    probe.onload = function () {
      // Не подменяем маленькую иконку на такую же маленькую картинку.
      var sufficientlyLarge = probe.naturalWidth >= 480 || probe.naturalHeight >= 480;
      if (!sufficientlyLarge && !explicit) return;
      bg.style.backgroundImage = cssUrl(candidate);
      bg.setAttribute('data-cover-source', explicit ? 'large-snippet' : 'vk-hires');
    };
    probe.onerror = function () {
      // main.js уже установил icon как фон, поэтому при ошибке ничего делать не надо.
    };
    probe.src = candidate;
  }

  function upgradePanelCovers() {
    var panels = document.querySelectorAll('.game-panel');
    Array.prototype.forEach.call(panels, installCover);
  }

  function observePanels() {
    var deck = document.getElementById('gamesDeck');
    if (!deck || !window.MutationObserver) return;
    if (coverObserver) coverObserver.disconnect();
    coverObserver = new MutationObserver(function () {
      upgradePanelCovers();
    });
    coverObserver.observe(deck, { childList: true, subtree: false });
  }

  function resetLaunchState() {
    launching = false;
    window.clearTimeout(launchResetTimer);
    document.body.classList.remove('is-game-launching');
    var scene = document.getElementById('gamesScene');
    if (scene) scene.classList.remove('is-game-launching');
    var active = document.querySelector('.game-panel.is-launching');
    if (active) active.classList.remove('is-launching');
  }

  function launch(panel, url) {
    if (launching || !url) return;
    launching = true;

    var scene = document.getElementById('gamesScene');
    var rect = panel ? panel.getBoundingClientRect() : null;
    var x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    var y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

    document.body.style.setProperty('--launch-x', x + 'px');
    document.body.style.setProperty('--launch-y', y + 'px');
    document.body.classList.add('is-game-launching');
    if (scene) scene.classList.add('is-game-launching');
    if (panel) panel.classList.add('is-launching');

    var delay = reducedMotion() ? 30 : 520;
    window.setTimeout(function () {
      window.location.assign(url);
    }, delay);

    launchResetTimer = window.setTimeout(resetLaunchState, 1800);
  }

  function shouldUseAnimatedLaunch(event) {
    if (event.defaultPrevented) return false;
    if (typeof event.button === 'number' && event.button !== 0) return false;
    return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
  }

  function handleClickCapture(event) {
    if (!shouldUseAnimatedLaunch(event)) return;

    var panel = event.target && event.target.closest ? event.target.closest('.game-panel') : null;
    if (panel) {
      if (!panel.classList.contains('is-active')) return;
      var panelUrl = gameUrlByPanel(panel);
      if (!panelUrl) return;
      event.preventDefault();
      event.stopPropagation();
      launch(panel, panelUrl);
      return;
    }

    var play = event.target && event.target.closest ? event.target.closest('#playGame') : null;
    if (play) {
      var active = document.querySelector('.game-panel.is-active');
      var href = play.href || gameUrlByPanel(active);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      launch(active, href);
    }
  }

  function handleKeyCapture(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var panel = event.target && event.target.closest ? event.target.closest('.game-panel.is-active') : null;
    if (!panel) return;
    var url = gameUrlByPanel(panel);
    if (!url) return;
    event.preventDefault();
    event.stopPropagation();
    launch(panel, url);
  }

  function init() {
    upgradePanelCovers();
    observePanels();
    document.addEventListener('click', handleClickCapture, true);
    document.addEventListener('keydown', handleKeyCapture, true);
    window.addEventListener('pageshow', function () {
      resetLaunchState();
      upgradePanelCovers();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
