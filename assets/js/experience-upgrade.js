// Дополнительный слой анимаций для витрины Wanderhaym Games.
// Не меняет GAMES_DATA и базовую механику карусели из main.js.
(function () {
  'use strict';

  var launching = false;
  var launchResetTimer = 0;

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function gameUrlByPanel(panel) {
    if (!panel) return '';
    var index = Number(panel.getAttribute('data-index'));
    var source = window.GAMES_DATA || [];
    var game = source[index];
    if (!game || !game.appId) return '';
    return 'https://vk.com/app' + encodeURIComponent(game.appId);
  }

  function decorateDominoVariants() {
    var panels = document.querySelectorAll('.game-panel[data-variant="domino"]');
    Array.prototype.forEach.call(panels, function (panel) {
      var title = panel.querySelector('.panel-title');
      var text = String(title && title.textContent || '').toLowerCase();
      panel.classList.remove('fx-domino-chaos', 'fx-domino-borders');
      if (text.indexOf('хаос') !== -1) panel.classList.add('fx-domino-chaos');
      else if (text.indexOf('границ') !== -1) panel.classList.add('fx-domino-borders');
    });
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

    // Переходим в той же вкладке, чтобы пользователь действительно увидел
    // короткий zoom/flash перед открытием VK Mini App и не упёрся в popup-blocker.
    var delay = reducedMotion() ? 30 : 520;
    window.setTimeout(function () {
      window.location.assign(url);
    }, delay);

    // Если навигация была отменена браузером, интерфейс не должен остаться заблокированным.
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
      // По боковой карточке первый клик по-прежнему только делает её активной.
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
    decorateDominoVariants();
    document.addEventListener('click', handleClickCapture, true);
    document.addEventListener('keydown', handleKeyCapture, true);
    window.addEventListener('pageshow', resetLaunchState);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
