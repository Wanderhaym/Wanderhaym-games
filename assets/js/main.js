// Логика лендинга «Мои игры».
// Рендерит карточки VK мини-игр из window.GAMES_DATA (см. games-data.js).

(function () {
  'use strict';

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  // Ссылка на игру во ВКонтакте.
  function gameUrl(appId) {
    return 'https://vk.com/app' + appId;
  }

  function renderGames(games) {
    var grid = document.getElementById('gamesGrid');
    if (!grid) return;

    if (!games || !games.length) {
      grid.innerHTML = '<div class="games-error">Игры не найдены.</div>';
      return;
    }

    grid.innerHTML = games.map(function (game) {
      var iconHtml = game.icon
        ? '<img src="' + escapeHtml(game.icon) + '" alt="' + escapeHtml(game.title) + '" loading="lazy">'
        : '🎮';
      var tagHtml = game.tag
        ? '<span class="g-tag">' + escapeHtml(game.tag) + '</span>'
        : '';

      return '' +
        '<div class="game-card">' +
          '<div class="g-icon">' + iconHtml + '</div>' +
          tagHtml +
          '<h3>' + escapeHtml(game.title) + '</h3>' +
          '<p>' + escapeHtml(game.description || 'Нет описания') + '</p>' +
          '<a class="btn btn-primary" href="' + gameUrl(game.appId) + '" target="_blank" rel="noopener">▶ Играть</a>' +
        '</div>';
    }).join('');
  }

  // Фоновая музыка: громкость 0.05, зациклена. Запускается после первого
  // клика/тапа (браузеры блокируют автовоспроизведение звука). При
  // сворачивании вкладки — пауза, при возврате — продолжение.
  function setupMusic() {
    var audio = document.getElementById('bgMusic');
    if (!audio) return;

    audio.volume = 0.05;
    audio.loop = true;
    audio.preload = 'auto';

    var started = false;

    function play() {
      if (!audio.paused) return;
      var p = audio.play();
      if (p && p.catch) {
        p.catch(function (err) {
          // Если файл ещё не загружен — попробуем позже.
          console.warn('Music play error:', err);
        });
      }
    }
    function pause() {
      audio.pause();
    }

    // Вызываем play() синхронно в обработчике первого жеста — так iOS
    // Safari и мобильные браузеры разрешают запуск звука. Повторяем
    // несколько раз с задержкой, чтобы учесть медленную загрузку файла.
    function startOnce() {
      if (started) return;
      started = true;

      // Первый вызов — прямо в обработчике жеста (синхронно).
      play();

      // Если файл ещё грузится — дополнительные попытки после загрузки.
      audio.addEventListener('canplaythrough', function onReady() {
        play();
        audio.removeEventListener('canplaythrough', onReady);
      });

      // Страховка: несколько повторов с интервалом, пока не заиграет.
      var attempts = 0;
      var timer = setInterval(function () {
        attempts += 1;
        if (!audio.paused || attempts > 15) {
          clearInterval(timer);
          return;
        }
        play();
      }, 400);

      document.removeEventListener('click', startOnce);
      document.removeEventListener('touchstart', startOnce);
    }
    document.addEventListener('click', startOnce);
    document.addEventListener('touchstart', startOnce);

    // Пауза при сворачивании вкладки, продолжение при возврате.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        pause();
      } else {
        play();
      }
    });
    window.addEventListener('pagehide', pause);
    window.addEventListener('pageshow', play);
  }

  function init() {
    // Текущий год в футере.
    var year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();

    renderGames(window.GAMES_DATA || []);
    setupMusic();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();