// Полноэкранный процедурный WebGL-мир Wanderhaym.
// Он реагирует на активную игру и ввод, но не меняет механику карусели.
(function () {
  'use strict';

  var canvas;
  var gl;
  var program;
  var frameId = 0;
  var lastFrame = 0;
  var sceneTime = 0;
  var renderScale = 1;
  var frameInterval = 0;
  var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var quality = document.documentElement.getAttribute('data-quality') || 'high';
  var lowPower = quality !== 'high' || window.innerWidth < 780 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  var veryLowPower = quality === 'low';
  var adapted = false;
  var frameSamples = 0;
  var frameSampleStarted = 0;
  var energyState = 'calm';

  var mouse = [0.5, 0.5];
  var mouseTarget = [0.5, 0.5];
  var pointerEnergy = 0;
  var pointerEnergyTarget = 0;
  var accent = [0.52, 1, 0.79];
  var accentTarget = accent.slice();
  var accentSoft = [0.38, 0.92, 0.72];
  var accentSoftTarget = accentSoft.slice();
  var energy = 0;
  var energyTarget = 0.18;
  var variant = 9;

  var variantIds = {
    domino: 0,
    pulse: 1,
    truth: 2,
    voice: 3,
    idea: 4,
    orbit: 5,
    romance: 6,
    smoke: 7,
    quiz: 8,
    spark: 9
  };

  var vertexShader = [
    'attribute vec2 aPosition;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = aPosition * 0.5 + 0.5;',
    '  gl_Position = vec4(aPosition, 0.0, 1.0);',
    '}'
  ].join('\n');

  var fragmentShader = [
    'precision highp float;',
    'uniform vec2 uResolution;',
    'uniform vec2 uMouse;',
    'uniform float uTime;',
    'uniform float uEnergy;',
    'uniform float uPointerEnergy;',
    'uniform float uVariant;',
    'uniform vec3 uAccent;',
    'uniform vec3 uAccentSoft;',
    'varying vec2 vUv;',
    '',
    'float hash21(vec2 p){',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    '',
    'float noise21(vec2 p){',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),',
    '             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);',
    '}',
    '',
    'float fbm(vec2 p){',
    '  float value = 0.0;',
    '  float amplitude = 0.5;',
    '  for(int i = 0; i < ' + (lowPower ? '3' : '4') + '; i++){',
    '    value += amplitude * noise21(p);',
    '    p = mat2(1.62, 1.17, -1.17, 1.62) * p;',
    '    amplitude *= 0.5;',
    '  }',
    '  return value;',
    '}',
    '',
    'float thinLine(float value, float width){',
    '  return 1.0 - smoothstep(width, width * 2.2, abs(value));',
    '}',
    '',
    'float rings(vec2 p, float speed){',
    '  float r = length(p);',
    '  return thinLine(sin(r * 24.0 - uTime * speed) * 0.12, 0.018);',
    '}',
    '',
    'float starField(vec2 p){',
    '  vec2 cell = floor(p * 38.0);',
    '  vec2 local = fract(p * 38.0) - 0.5;',
    '  float seed = hash21(cell);',
    '  float star = 1.0 - smoothstep(0.025, 0.13, length(local));',
    '  return star * step(0.89, seed) * (0.48 + 0.52 * sin(uTime * (0.7 + seed) + seed * 18.0));',
    '}',
    '',
    'float variantPattern(vec2 p){',
    '  float value = 0.0;',
    '  if(uVariant < 0.5){',
    '    vec2 grid = abs(fract((p + vec2(uTime * 0.012, 0.0)) * 5.0) - 0.5);',
    '    value = 1.0 - smoothstep(0.455, 0.495, max(grid.x, grid.y));',
    '    value += rings(p * 0.72, 0.45) * 0.36;',
    '  }else if(uVariant < 1.5){',
    '    value = rings(p, 1.35) + rings(p - vec2(0.42, -0.16), 1.0) * 0.42;',
    '  }else if(uVariant < 2.5){',
    '    float split = thinLine(p.x + p.y * 0.26 + sin(uTime * 0.8) * 0.08, 0.025);',
    '    float bands = 0.5 + 0.5 * sin((p.x - p.y) * 18.0 + uTime * 1.4);',
    '    value = split + bands * 0.2;',
    '  }else if(uVariant < 3.5){',
    '    float wave = p.y - sin(p.x * 9.0 + uTime * 1.8) * (0.13 + 0.04 * sin(p.x * 3.0));',
    '    value = thinLine(wave, 0.022) + thinLine(wave + 0.18, 0.014) * 0.46 + thinLine(wave - 0.18, 0.014) * 0.46;',
    '  }else if(uVariant < 4.5){',
    '    vec2 cell = floor((p + vec2(uTime * 0.02, -uTime * 0.012)) * 7.0);',
    '    float seed = hash21(cell);',
    '    value = step(0.72, seed) * (0.28 + 0.72 * noise21(p * 6.0 + seed));',
    '  }else if(uVariant < 5.5){',
    '    value = rings(p * vec2(1.0, 1.62), 0.55) + rings((p - vec2(0.28, 0.08)) * vec2(1.48, 0.8), -0.4) * 0.54;',
    '  }else if(uVariant < 6.5){',
    '    float a = exp(-5.2 * length(p - vec2(-0.22, 0.02)));',
    '    float b = exp(-5.2 * length(p - vec2(0.22, 0.02)));',
    '    value = (a + b) * (0.72 + 0.28 * sin(uTime * 2.1));',
    '  }else if(uVariant < 7.5){',
    '    value = smoothstep(0.46, 0.82, fbm(p * 2.3 + vec2(0.0, -uTime * 0.11)));',
    '  }else if(uVariant < 8.5){',
    '    vec2 cell = floor(p * 8.0);',
    '    vec2 local = fract(p * 8.0) - 0.5;',
    '    float seed = hash21(cell);',
    '    value = (1.0 - smoothstep(0.04, 0.24, length(local))) * step(0.68, seed);',
    '  }else{',
    '    value = starField(p * 1.15);',
    '  }',
    '  return value;',
    '}',
    '',
    'void main(){',
    '  float aspect = uResolution.x / max(uResolution.y, 1.0);',
    '  vec2 p = vUv * 2.0 - 1.0;',
    '  p.x *= aspect;',
    '  vec2 mouse = uMouse * 2.0 - 1.0;',
    '  mouse.x *= aspect;',
    '  vec2 delta = p - mouse;',
    '  float mouseGlow = exp(-4.4 * dot(delta, delta));',
    '  float mouseWarp = exp(-7.0 * dot(delta, delta)) * (0.035 + uPointerEnergy * 0.075);',
    '  p += normalize(delta + vec2(0.0001)) * mouseWarp;',
    '',
    '  float mist = fbm(p * 1.35 + vec2(uTime * 0.025, -uTime * 0.018));',
    '  float deepMist = fbm(p * 0.62 - vec2(uTime * 0.012, 0.0));',
    '  float pattern = variantPattern(p);',
    '  float stars = starField(p + vec2(uTime * 0.006, 0.0));',
    '  float radial = exp(-1.45 * dot(p * vec2(0.72, 1.0), p * vec2(0.72, 1.0)));',
    '  float sweep = 0.5 + 0.5 * sin(atan(p.y, p.x) * 3.0 - uTime * 0.24 + length(p) * 5.0);',
    '',
    '  vec3 color = vec3(0.006, 0.009, 0.018);',
    '  color += uAccentSoft * deepMist * 0.08;',
    '  color += mix(uAccentSoft, uAccent, mist) * radial * (0.07 + mist * 0.12);',
    '  color += uAccent * pattern * (0.08 + uEnergy * 0.12);',
    '  color += uAccentSoft * stars * (0.18 + uEnergy * 0.18);',
    '  color += mix(uAccentSoft, uAccent, sweep) * mouseGlow * (0.05 + uPointerEnergy * 0.15);',
    '  color += uAccent * radial * uEnergy * 0.035;',
    '',
    '  float grain = hash21(gl_FragCoord.xy + floor(uTime * 24.0)) - 0.5;',
    '  color += grain * 0.012;',
    '  float vignette = 1.0 - smoothstep(0.2, 1.42, length(p * vec2(0.68, 0.92)));',
    '  color *= 0.54 + vignette * 0.66;',
    '  color = pow(max(color, 0.0), vec3(0.9));',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  function createShader(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('World shader: ' + message);
    }
    return shader;
  }

  function createProgram() {
    var vertex = createShader(gl.VERTEX_SHADER, vertexShader);
    var fragment = createShader(gl.FRAGMENT_SHADER, fragmentShader);
    var result = gl.createProgram();
    gl.attachShader(result, vertex);
    gl.attachShader(result, fragment);
    gl.linkProgram(result);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
      var message = gl.getProgramInfoLog(result);
      gl.deleteProgram(result);
      throw new Error('World program: ' + message);
    }
    return result;
  }

  function hexToRgb(value, fallback) {
    var match = String(value || '').trim().match(/^#([0-9a-f]{6})$/i);
    if (!match) return fallback.slice();
    var number = parseInt(match[1], 16);
    return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255];
  }

  function lerp(value, target, amount) {
    return value + (target - value) * amount;
  }

  function resize() {
    if (!canvas || !gl) return;
    var dprCap = lowPower ? 1 : 1.25;
    var dpr = Math.min(window.devicePixelRatio || 1, dprCap) * renderScale;
    var width = Math.max(1, Math.floor(window.innerWidth * dpr));
    var height = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    if (reducedMotion) draw(performance.now(), true);
  }

  function setEnergyAttribute() {
    var next = energy > 0.42 ? 'high' : 'calm';
    if (next === energyState) return;
    energyState = next;
    document.documentElement.setAttribute('data-world-energy', next);
  }

  function draw(timestamp, force) {
    if (!gl || !program) return;
    var delta = lastFrame ? Math.min(50, timestamp - lastFrame) : 16.7;
    if (!force && frameInterval && delta < frameInterval) {
      frameId = window.requestAnimationFrame(draw);
      return;
    }
    lastFrame = timestamp;
    sceneTime += delta * 0.001;

    for (var i = 0; i < 3; i += 1) {
      accent[i] = lerp(accent[i], accentTarget[i], 0.035);
      accentSoft[i] = lerp(accentSoft[i], accentSoftTarget[i], 0.035);
    }
    mouse[0] = lerp(mouse[0], mouseTarget[0], 0.075);
    mouse[1] = lerp(mouse[1], mouseTarget[1], 0.075);
    pointerEnergy = lerp(pointerEnergy, pointerEnergyTarget, 0.08);
    energy = lerp(energy, energyTarget, 0.07);
    pointerEnergyTarget *= 0.91;
    energyTarget = Math.max(0.12, energyTarget * 0.965);
    setEnergyAttribute();

    document.documentElement.style.setProperty('--world-pointer-x', (mouse[0] * 100).toFixed(2) + '%');
    document.documentElement.style.setProperty('--world-pointer-y', ((1 - mouse[1]) * 100).toFixed(2) + '%');

    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.mouse, mouse[0], mouse[1]);
    gl.uniform1f(uniforms.time, sceneTime);
    gl.uniform1f(uniforms.energy, energy);
    gl.uniform1f(uniforms.pointerEnergy, pointerEnergy);
    gl.uniform1f(uniforms.variant, variant);
    gl.uniform3fv(uniforms.accent, accent);
    gl.uniform3fv(uniforms.accentSoft, accentSoft);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (!adapted && !reducedMotion) {
      if (!frameSampleStarted) frameSampleStarted = timestamp;
      frameSamples += 1;
      if (frameSamples >= 120) {
        var measuredFps = frameSamples * 1000 / Math.max(1, timestamp - frameSampleStarted);
        var targetFps = frameInterval ? 1000 / frameInterval : 60;
        if (measuredFps < targetFps * 0.78 && renderScale > 0.55) {
          renderScale *= 0.82;
          adapted = true;
          resize();
        }
      }
    }

    if (!reducedMotion) frameId = window.requestAnimationFrame(draw);
  }

  function handlePointer(event) {
    var dx = event.clientX / Math.max(1, window.innerWidth) - mouseTarget[0];
    var dy = 1 - event.clientY / Math.max(1, window.innerHeight) - mouseTarget[1];
    mouseTarget[0] = event.clientX / Math.max(1, window.innerWidth);
    mouseTarget[1] = 1 - event.clientY / Math.max(1, window.innerHeight);
    pointerEnergyTarget = Math.min(1.5, pointerEnergyTarget + Math.sqrt(dx * dx + dy * dy) * 4.8);
  }

  function handleGameChange(event) {
    var detail = event && event.detail || {};
    accentTarget = hexToRgb(detail.accent, accentTarget);
    accentSoftTarget = hexToRgb(detail.accentSoft, accentSoftTarget);
    if (Object.prototype.hasOwnProperty.call(variantIds, detail.variant)) variant = variantIds[detail.variant];
    energyTarget = 1.15;
    document.documentElement.setAttribute('data-world-variant', detail.variant || 'spark');
    document.documentElement.setAttribute('data-world-title', detail.title || 'Wanderhaym Games');
    if (reducedMotion) draw(performance.now(), true);
  }

  var uniforms;

  function initGl() {
    var options = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: lowPower ? 'low-power' : 'high-performance' };
    gl = canvas.getContext('webgl2', options) || canvas.getContext('webgl', options);
    if (!gl) return false;
    program = createProgram();
    gl.useProgram(program);

    var vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    var position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    uniforms = {
      resolution: gl.getUniformLocation(program, 'uResolution'),
      mouse: gl.getUniformLocation(program, 'uMouse'),
      time: gl.getUniformLocation(program, 'uTime'),
      energy: gl.getUniformLocation(program, 'uEnergy'),
      pointerEnergy: gl.getUniformLocation(program, 'uPointerEnergy'),
      variant: gl.getUniformLocation(program, 'uVariant'),
      accent: gl.getUniformLocation(program, 'uAccent'),
      accentSoft: gl.getUniformLocation(program, 'uAccentSoft')
    };
    return true;
  }

  function init() {
    canvas = document.getElementById('worldCanvas');
    if (!canvas) return;
    renderScale = veryLowPower ? 0.48 : (lowPower ? 0.58 : 0.76);
    frameInterval = veryLowPower ? 1000 / 24 : (lowPower ? 1000 / 30 : 1000 / 36);

    try {
      if (!initGl()) {
        document.documentElement.setAttribute('data-world-ready', 'fallback');
        return;
      }
    } catch (error) {
      console.error(error);
      document.documentElement.setAttribute('data-world-ready', 'fallback');
      return;
    }

    window.addEventListener('wanderhaym:gamechange', handleGameChange);
    window.addEventListener('pointermove', handlePointer, { passive: true });
    window.addEventListener('wheel', function () {
      energyTarget = Math.max(energyTarget, 0.78);
    }, { passive: true });
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      } else if (!reducedMotion && !frameId) {
        lastFrame = 0;
        frameId = window.requestAnimationFrame(draw);
      }
    });

    resize();
    document.documentElement.setAttribute('data-world-ready', 'true');
    document.documentElement.setAttribute('data-world-energy', 'calm');
    if (reducedMotion) draw(performance.now(), true);
    else frameId = window.requestAnimationFrame(draw);

    window.WanderhaymWorld = {
      supported: true,
      getState: function () {
        return {
          variant: variant,
          energy: energy,
          lowPower: lowPower,
          renderScale: renderScale,
          resolution: [canvas.width, canvas.height]
        };
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
