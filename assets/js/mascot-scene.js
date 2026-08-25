// Два растровых состояния персонажа из утверждённых референсов: спокойная
// стойка и удар. Смена игры запускает удар, звук и пространственный разлёт искр.
(function () {
  'use strict';

  var stage = document.getElementById('wanderhaymMascot');
  var impact = stage && stage.querySelector('.mascot-impact');
  var sparkLayer = document.getElementById('screenSparks');
  var sparkContext = sparkLayer && sparkLayer.getContext ? sparkLayer.getContext('2d', { alpha: true }) : null;
  var flash = document.getElementById('screenImpactFlash');
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var firstGameEvent = true;
  var hitTimer = 0;
  var impactTimer = 0;
  var lastDetail = null;
  var particles = [];
  var particleFrame = 0;
  var particleTime = 0;
  var canvasDpr = 1;
  var lastManualHitAt = 0;

  if (!stage || !impact || !sparkLayer || !sparkContext) return;

  function prepareMascotFrames() {
    var frames = Array.prototype.slice.call(stage.querySelectorAll('.mascot-pose, .mascot-anvil-sprite'));
    var waits = frames.map(function (frame) {
      if (frame.complete && frame.naturalWidth) {
        if (frame.decode) return frame.decode().catch(function () {});
        return Promise.resolve();
      }
      return new Promise(function (resolve) {
        frame.addEventListener('load', resolve, { once: true });
        frame.addEventListener('error', resolve, { once: true });
      }).then(function () {
        if (frame.decode) return frame.decode().catch(function () {});
      });
    });
    Promise.all(waits).then(function () {
      stage.classList.add('mascot-assets-ready');
    });
  }

  prepareMascotFrames();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function playHitSound() {
    try {
      var sound = new Audio('assets/mascot/hammer-hit.wav');
      sound.volume = .42;
      var playback = sound.play();
      if (playback && playback.catch) playback.catch(function () {});
    } catch (_) {}

    try {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      var context = new AudioContextClass();
      var now = context.currentTime;
      var oscillator = context.createOscillator();
      var gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(146, now);
      oscillator.frequency.exponentialRampToValueAtTime(48, now + .24);
      gain.gain.setValueAtTime(.001, now);
      gain.gain.exponentialRampToValueAtTime(.24, now + .008);
      gain.gain.exponentialRampToValueAtTime(.001, now + .3);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + .32);
      window.setTimeout(function () { context.close(); }, 520);
    } catch (_) {}
  }

  function resizeSparkCanvas() {
    canvasDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var width = Math.max(1, Math.round(window.innerWidth * canvasDpr));
    var height = Math.max(1, Math.round(window.innerHeight * canvasDpr));
    if (sparkLayer.width !== width || sparkLayer.height !== height) {
      sparkLayer.width = width;
      sparkLayer.height = height;
      sparkLayer.style.width = window.innerWidth + 'px';
      sparkLayer.style.height = window.innerHeight + 'px';
    }
  }

  function createParticle(originX, originY, towardViewer) {
    var angle = Math.random() * Math.PI * 2;
    var viewport = Math.hypot(window.innerWidth, window.innerHeight);
    var speed = (towardViewer ? .3 : .2) * viewport + Math.random() * (towardViewer ? .4 : .28) * viewport;
    var life = towardViewer ? .72 + Math.random() * .42 : .54 + Math.random() * .4;
    return {
      originX: originX,
      originY: originY,
      x: 0,
      y: 0,
      z: 0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (towardViewer ? 85 : 120),
      vz: towardViewer ? 520 + Math.random() * 520 : -30 + Math.random() * 190,
      gravity: 210 + Math.random() * 170,
      size: towardViewer ? 5 + Math.random() * 6 : 1.6 + Math.random() * 3.2,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - .5) * 12,
      age: 0,
      life: life,
      ember: towardViewer && Math.random() > .55
    };
  }

  function renderParticles(now) {
    var dt = particleTime ? Math.min((now - particleTime) / 1000, .034) : .016;
    particleTime = now;
    resizeSparkCanvas();
    sparkContext.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
    sparkContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
    sparkContext.globalCompositeOperation = 'lighter';

    particles = particles.filter(function (particle) {
      particle.age += dt;
      if (particle.age >= particle.life) return false;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.z += particle.vz * dt;
      particle.rotation += particle.spin * dt;

      var progress = particle.age / particle.life;
      var depthScale = clamp(1 + particle.z / 92, .35, 6.4);
      var alpha = Math.min(progress * 12, 1) * Math.pow(1 - progress, .72);
      var x = particle.originX + particle.x * depthScale;
      var y = particle.originY + particle.y * depthScale;
      var size = particle.size * depthScale;
      if (x < -120 || x > window.innerWidth + 120 || y < -120 || y > window.innerHeight + 120) return false;

      sparkContext.save();
      sparkContext.translate(x, y);
      sparkContext.rotate(particle.rotation);
      sparkContext.globalAlpha = alpha;
      sparkContext.shadowBlur = Math.min(24, size * 2.8);
      sparkContext.shadowColor = '#ff6b08';
      var gradient = sparkContext.createLinearGradient(0, size * 2.2, 0, -size * 2.2);
      gradient.addColorStop(0, '#ff4b00');
      gradient.addColorStop(.42, '#ff9b10');
      gradient.addColorStop(.76, '#ffe46b');
      gradient.addColorStop(1, '#fffce4');
      sparkContext.fillStyle = gradient;
      if (particle.ember) {
        sparkContext.beginPath();
        sparkContext.moveTo(0, -size * 1.2);
        sparkContext.lineTo(size * .75, 0);
        sparkContext.lineTo(0, size * 1.25);
        sparkContext.lineTo(-size * .75, 0);
        sparkContext.closePath();
        sparkContext.fill();
      } else {
        sparkContext.fillRect(-Math.max(.7, size * .18), -size * 2.2, Math.max(1.4, size * .36), size * 4.4);
      }
      sparkContext.restore();
      return true;
    });

    if (particles.length) particleFrame = requestAnimationFrame(renderParticles);
    else {
      particleFrame = 0;
      particleTime = 0;
      sparkContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  function burst(detail) {
    var rect = impact.getBoundingClientRect();
    var originX = rect.left + rect.width * .5;
    var originY = rect.top + rect.height * .5;
    var compact = window.innerWidth < 781;
    var sideCount = reducedMotion ? 5 : (compact ? 18 : 28);
    var viewerCount = reducedMotion ? 3 : (compact ? 7 : 12);

    sparkLayer.style.setProperty('--impact-x', originX + 'px');
    sparkLayer.style.setProperty('--impact-y', originY + 'px');
    if (flash) {
      flash.style.setProperty('--impact-x', originX + 'px');
      flash.style.setProperty('--impact-y', originY + 'px');
      flash.classList.remove('is-active');
      void flash.offsetWidth;
      flash.classList.add('is-active');
    }
    for (var i = 0; i < sideCount; i += 1) particles.push(createParticle(originX, originY, false));
    for (var j = 0; j < viewerCount; j += 1) particles.push(createParticle(originX, originY, true));
    if (!particleFrame) particleFrame = requestAnimationFrame(renderParticles);
    playHitSound();
  }

  function hammerHit(detail) {
    lastDetail = detail || lastDetail;
    window.clearTimeout(hitTimer);
    window.clearTimeout(impactTimer);
    stage.classList.remove('is-hitting', 'is-impacting');
    void stage.offsetWidth;
    stage.classList.add('is-hitting');
    impactTimer = window.setTimeout(function () {
      stage.classList.add('is-impacting');
      burst(lastDetail);
    }, reducedMotion ? 10 : 285);
    hitTimer = window.setTimeout(function () {
      stage.classList.remove('is-hitting', 'is-impacting');
    }, reducedMotion ? 90 : 780);
  }

  window.addEventListener('wanderhaym:gamechange', function (event) {
    lastDetail = event.detail || null;
    if (firstGameEvent) {
      firstGameEvent = false;
      return;
    }
    hammerHit(lastDetail);
  });

  // Пустая часть сцены — это тоже часть игры. Но настоящие элементы
  // интерфейса (карточки, кнопки, ссылки) оставляем работать как прежде.
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0 || !event.detail) return;
    if (event.target && event.target.closest && event.target.closest('a, button, input, textarea, select, [role="button"], [data-no-mascot-hit]')) return;
    var now = Date.now();
    if (now - lastManualHitAt < 480) return;
    lastManualHitAt = now;
    hammerHit({ source: 'empty-space' });
  });
  window.addEventListener('pagehide', function () {
    window.clearTimeout(hitTimer);
    window.clearTimeout(impactTimer);
    if (particleFrame) cancelAnimationFrame(particleFrame);
    particleFrame = 0;
    particles = [];
  });
  window.WanderhaymMascot = {
    hit: hammerHit,
    getState: function () {
      return {
        hitting: stage.classList.contains('is-hitting'),
        sparks: particles.length,
        lastGame: lastDetail && lastDetail.title || null
      };
    }
  };
}());
