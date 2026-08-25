// Небольшой Experience-контроллер поверх существующей витрины. Он отвечает
// за качество устройства, загрузочную сцену, ритм переходов и аудио-индикатор.
(function () {
  'use strict';

  var root = document.documentElement;
  var loader = document.getElementById('experienceLoader');
  var progress = document.getElementById('loaderProgress');
  var value = document.getElementById('loaderValue');
  var experience = document.querySelector('.experience');
  var audio = document.getElementById('bgMusic');
  var audioToggle = document.getElementById('audioToggle');
  var shiftTimer = 0;
  var firstScene = true;

  function detectQuality() {
    var compact = window.matchMedia && window.matchMedia('(max-width: 780px)').matches;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var memory = Number(navigator.deviceMemory || 8);
    var cores = Number(navigator.hardwareConcurrency || 8);
    var quality = reduced || memory <= 2 || cores <= 2 ? 'low' : (compact || memory <= 4 || cores <= 4 ? 'medium' : 'high');
    root.setAttribute('data-quality', quality);
    root.setAttribute('data-input', compact ? 'touch' : 'pointer');
    return quality;
  }

  function criticalImages() {
    var urls = [];
    var games = Array.isArray(window.GAMES_DATA) ? window.GAMES_DATA : [];
    games.forEach(function (game) {
      var source = game && (game.cover || game.largeCover || game.icon);
      if (typeof source === 'string' && source) urls.push(source);
    });
    urls.push(
      'assets/mascot/wanderhaym-cat-idle.png',
      'assets/mascot/wanderhaym-cat-impact.png',
      'assets/mascot/impact-platform-idle.png',
      'assets/mascot/impact-platform-hit.png'
    );
    return urls.filter(function (url, index, list) { return list.indexOf(url) === index; });
  }

  function loadImage(url) {
    return new Promise(function (resolve) {
      var image = new Image();
      var settled = false;
      function done() {
        if (settled) return;
        settled = true;
        if (image.decode && image.complete && image.naturalWidth) {
          image.decode().catch(function () {}).then(resolve);
        } else resolve();
      }
      image.onload = done;
      image.onerror = done;
      image.src = url;
      if (image.complete) done();
    });
  }

  function updateLoader(done, total) {
    var percent = total ? Math.round(done / total * 100) : 100;
    root.style.setProperty('--loader-progress', percent + '%');
    if (progress) progress.style.width = percent + '%';
    if (value) value.textContent = String(percent).padStart(2, '0') + '%';
  }

  function startLoader() {
    var started = performance.now();
    var urls = criticalImages();
    var done = 0;
    updateLoader(0, urls.length);
    var jobs = urls.map(function (url) {
      return loadImage(url).then(function () {
        done += 1;
        updateLoader(done, urls.length);
      });
    });
    var timeout = new Promise(function (resolve) { window.setTimeout(resolve, 4500); });
    Promise.race([Promise.all(jobs), timeout]).then(function () {
      var remaining = Math.max(0, 720 - (performance.now() - started));
      window.setTimeout(function () {
        updateLoader(urls.length, urls.length);
        root.setAttribute('data-experience-ready', 'true');
        if (loader) loader.classList.add('is-leaving');
      }, remaining);
    });
  }

  function setAudioState(enabled) {
    root.setAttribute('data-audio', enabled ? 'on' : 'off');
    if (audioToggle) audioToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }

  function setupAudioToggle() {
    if (!audio || !audioToggle) return;
    audioToggle.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
    audioToggle.addEventListener('touchstart', function (event) { event.stopPropagation(); }, { passive: true });
    audioToggle.addEventListener('click', function (event) {
      event.stopPropagation();
      var enable = audioToggle.getAttribute('aria-pressed') !== 'true';
      audio.muted = !enable;
      if (enable) {
        var play = audio.play();
        if (play && play.catch) play.catch(function () { setAudioState(false); });
      }
      setAudioState(enable);
    });
    window.addEventListener('wanderhaym:audio', function (event) {
      setAudioState(!!(event.detail && event.detail.enabled));
    });
    setAudioState(!audio.paused && !audio.muted);
  }

  function setupSceneRhythm() {
    window.addEventListener('wanderhaym:gamechange', function () {
      if (firstScene) { firstScene = false; return; }
      if (!experience) return;
      window.clearTimeout(shiftTimer);
      experience.classList.remove('is-scene-shifting');
      void experience.offsetWidth;
      experience.classList.add('is-scene-shifting');
      shiftTimer = window.setTimeout(function () { experience.classList.remove('is-scene-shifting'); }, 680);
    });
  }

  detectQuality();
  startLoader();
  setupAudioToggle();
  setupSceneRhythm();
  window.addEventListener('resize', detectQuality, { passive: true });
}());
