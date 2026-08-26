import * as THREE from 'three';

export type PortalRevealMode =
  | 'organic'
  | 'grid'
  | 'waveform'
  | 'radar'
  | 'chain'
  | 'bond'
  | 'shards'
  | 'decision'
  | 'smoke'
  | 'truth'
  | 'domino';

export function portalRevealModeValue(mode: PortalRevealMode): number {
  if (mode === 'grid') return 1;
  if (mode === 'waveform') return 2;
  if (mode === 'radar') return 3;
  if (mode === 'chain') return 4;
  if (mode === 'bond') return 5;
  if (mode === 'shards') return 6;
  if (mode === 'decision') return 7;
  if (mode === 'smoke') return 8;
  if (mode === 'truth') return 9;
  if (mode === 'domino') return 10;
  return 0;
}

const revealShader = {
  uniforms: {
    tCover: { value: null },
    tGameplay: { value: null },
    uCoverScale: { value: new THREE.Vector2(1, 1) },
    uCoverOffset: { value: new THREE.Vector2() },
    uGameplayScale: { value: new THREE.Vector2(1, 1) },
    uGameplayOffset: { value: new THREE.Vector2() },
    uPointer: { value: new THREE.Vector2(0.5, 0.5) },
    uReveal: { value: 0 },
    uTime: { value: 0 },
    uGameplayExposure: { value: 0.82 },
    uMode: { value: 0 },
    uAccent: { value: new THREE.Color(0xfa6a55) },
    uWorldHeat: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tCover;
    uniform sampler2D tGameplay;
    uniform vec2 uCoverScale;
    uniform vec2 uCoverOffset;
    uniform vec2 uGameplayScale;
    uniform vec2 uGameplayOffset;
    uniform vec2 uPointer;
    uniform float uReveal;
    uniform float uTime;
    uniform float uGameplayExposure;
    uniform float uMode;
    uniform vec3 uAccent;
    uniform float uWorldHeat;
    varying vec2 vUv;

    float hash(vec2 point) {
      return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 delta = vUv - uPointer;
      float distanceToTouch = length(delta);
      float angle = atan(delta.y, delta.x);
      float sharedRadius = 0.19;
      float wobble = sin(angle * 7.0 + uTime * 1.9) * 0.008
        + sin(angle * 13.0 - uTime * 2.6) * 0.0045;
      float radius = sharedRadius;
      float noisyEdge = radius + wobble + (hash(floor(vUv * 92.0)) - 0.5) * 0.008;
      float organicHole = (1.0 - smoothstep(noisyEdge - 0.014, noisyEdge + 0.016, distanceToTouch)) * uReveal;
      vec2 gridSize = vec2(8.0);
      vec2 gridCell = floor(vUv * gridSize);
      vec2 gridCenter = (gridCell + 0.5) / gridSize;
      float gridDistance = length(gridCenter - uPointer);
      float gridRadius = sharedRadius;
      float gridHole = (1.0 - smoothstep(gridRadius - 0.025, gridRadius + 0.014, distanceToTouch)) * uReveal;
      float gridMode = 1.0 - step(0.5, abs(uMode - 1.0));
      float waveformMode = 1.0 - step(0.5, abs(uMode - 2.0));
      float radarMode = 1.0 - step(0.5, abs(uMode - 3.0));
      float chainMode = 1.0 - step(0.5, abs(uMode - 4.0));
      float bondMode = 1.0 - step(0.5, abs(uMode - 5.0));
      float shardsMode = 1.0 - step(0.5, abs(uMode - 6.0));
      float decisionMode = 1.0 - step(0.5, abs(uMode - 7.0));
      float smokeMode = 1.0 - step(0.5, abs(uMode - 8.0));
      float truthMode = 1.0 - step(0.5, abs(uMode - 9.0));
      float dominoMode = 1.0 - step(0.5, abs(uMode - 10.0));
      float organicMode = 1.0 - gridMode - waveformMode - radarMode - chainMode
        - bondMode - shardsMode - decisionMode - smokeMode - truthMode - dominoMode;
      float waveformRadius = sharedRadius;
      float waveformEnvelope = 1.0 - smoothstep(
        waveformRadius * 0.72,
        waveformRadius,
        length(delta * vec2(0.94, 1.0))
      );
      float frequencyBands = 0.5 + 0.5 * sin(delta.y * 118.0 + sin(delta.x * 22.0 - uTime * 2.6) * 2.4);
      float waveformHole = waveformEnvelope * uReveal;
      float radarRadius = sharedRadius;
      float radarEnvelope = 1.0 - smoothstep(radarRadius * 0.82, radarRadius, distanceToTouch);
      float memoryRings = smoothstep(0.3, 0.78, 0.5 + 0.5 * sin(distanceToTouch * 112.0 - uTime * 2.3));
      float sweepAngle = angle + uTime * 0.82;
      float memorySweep = pow(max(0.0, cos(sweepAngle)), 18.0);
      float radarHole = radarEnvelope * uReveal;
      vec2 chainGridSize = vec2(9.0);
      vec2 chainCell = floor(vUv * chainGridSize);
      vec2 chainLocal = fract(vUv * chainGridSize) - 0.5;
      vec2 chainCenter = (chainCell + 0.5) / chainGridSize;
      float chainDistance = length(chainCenter - uPointer);
      float chainSeed = hash(chainCell + 17.0);
      float chainRadius = max(0.025, sharedRadius - 0.012);
      float chainReach = 1.0 - smoothstep(
        chainRadius - 0.055 + chainSeed * 0.035,
        chainRadius + 0.018 + chainSeed * 0.035,
        chainDistance
      );
      float chainNode = 1.0 - smoothstep(0.34, 0.49, length(chainLocal));
      float chainHole = chainReach * uReveal;
      float bondOffset = 0.06;
      float bondRadius = 0.13;
      float bondLeftDistance = length(delta + vec2(bondOffset, 0.0));
      float bondRightDistance = length(delta - vec2(bondOffset, 0.0));
      float bondLeft = 1.0 - smoothstep(bondRadius - 0.018, bondRadius + 0.014, bondLeftDistance);
      float bondRight = 1.0 - smoothstep(bondRadius - 0.018, bondRadius + 0.014, bondRightDistance);
      float bondHole = max(bondLeft, bondRight) * uReveal;
      float shardRadius = sharedRadius;
      float shardAngle = atan(delta.y, delta.x);
      float shardSector = fract((shardAngle / 6.2831853 + 0.5) * 13.0);
      float shardBand = fract(distanceToTouch * 15.0 - uTime * 0.08);
      float shardSeed = hash(vec2(floor((shardAngle / 6.2831853 + 0.5) * 13.0), floor(distanceToTouch * 15.0)));
      float shardReach = 1.0 - smoothstep(
        shardRadius - 0.065 + shardSeed * 0.045,
        shardRadius + 0.018 + shardSeed * 0.045,
        distanceToTouch
      );
      float shardHole = shardReach * uReveal;
      float coinRadius = sharedRadius;
      float coinRotation = sin(uTime * 1.35) * 0.24;
      float coinCosine = cos(coinRotation);
      float coinSine = sin(coinRotation);
      vec2 coinPoint = mat2(coinCosine, -coinSine, coinSine, coinCosine) * delta;
      float coinSquash = 0.72 + abs(cos(uTime * 1.75)) * 0.28;
      float coinDistance = length(vec2(coinPoint.x / coinSquash, coinPoint.y));
      float decisionHole = (1.0 - smoothstep(coinRadius - 0.015, coinRadius + 0.015, coinDistance)) * uReveal;
      float smokeRadius = sharedRadius;
      float smokeNoise = sin(angle * 9.0 + uTime * 1.6) * 0.012 + sin(angle * 15.0 - uTime * 1.15) * 0.007;
      float smokeHole = (1.0 - smoothstep(
        smokeRadius + smokeNoise - 0.022,
        smokeRadius + smokeNoise + 0.018,
        distanceToTouch
      )) * uReveal;
      float truthSize = sharedRadius;
      float truthDistance = abs(delta.x) + abs(delta.y);
      float truthEnvelope = 1.0 - smoothstep(truthSize - 0.025, truthSize + 0.012, truthDistance);
      float truthScan = 0.5 + 0.5 * sin(delta.y * 132.0 - uTime * 4.5);
      float truthHole = truthEnvelope * uReveal;
      vec2 dominoGridSize = vec2(7.0, 6.0);
      vec2 dominoCell = floor(vUv * dominoGridSize);
      vec2 dominoCenter = (dominoCell + 0.5) / dominoGridSize;
      float dominoDistance = length(dominoCenter - uPointer);
      float dominoSeed = hash(dominoCell + vec2(43.0, 17.0));
      float dominoReach = 1.0 - smoothstep(
        sharedRadius - 0.06 + dominoSeed * 0.045,
        sharedRadius + 0.018 + dominoSeed * 0.045,
        dominoDistance
      );
      float dominoHole = dominoReach * uReveal;
      float hole = organicHole * organicMode + gridHole * gridMode
        + waveformHole * waveformMode + radarHole * radarMode + chainHole * chainMode
        + bondHole * bondMode + shardHole * shardsMode + decisionHole * decisionMode
        + smokeHole * smokeMode + truthHole * truthMode + dominoHole * dominoMode;

      vec2 direction = normalize(delta + vec2(0.0001));
      float innerWave = sin(distanceToTouch * 92.0 - uTime * 7.2) * 0.0038 * hole * organicMode;
      vec2 gameplayUv = clamp(vUv + direction * innerWave, 0.001, 0.999);
      float lieSide = step(0.0, delta.x + delta.y);
      gameplayUv.x += sin(delta.y * 118.0 + uTime * 8.0) * 0.0065 * lieSide * truthEnvelope * truthMode;
      gameplayUv = clamp(gameplayUv, 0.001, 0.999);
      vec4 cover = texture2D(tCover, vUv * uCoverScale + uCoverOffset);
      vec4 gameplay = texture2D(tGameplay, gameplayUv * uGameplayScale + uGameplayOffset);
      gameplay.rgb *= uGameplayExposure;
      vec3 color = mix(cover.rgb, gameplay.rgb, hole);

      float rim = (1.0 - smoothstep(0.0, 0.018, abs(distanceToTouch - noisyEdge))) * uReveal * organicMode;
      float ripple = pow(max(0.0, sin((distanceToTouch - radius) * 92.0 - uTime * 5.4)), 10.0)
        * (1.0 - smoothstep(radius, radius + 0.14, distanceToTouch)) * uReveal * organicMode;
      vec2 gridUv = fract(vUv * gridSize);
      float cellEdgeDistance = min(min(gridUv.x, 1.0 - gridUv.x), min(gridUv.y, 1.0 - gridUv.y));
      float cellEdge = (1.0 - smoothstep(0.008, 0.045, cellEdgeDistance)) * gridHole * gridMode;
      float gridScan = (1.0 - smoothstep(0.0, 0.036, abs(gridDistance - gridRadius))) * uReveal * gridMode;
      float voiceAmplitude = (0.018 + sin(delta.x * 17.0 + uTime * 1.8) * 0.012)
        * (1.0 - smoothstep(0.04, 0.34, abs(delta.x)));
      float voiceCurve = sin(delta.x * 39.0 - uTime * 4.4) * voiceAmplitude;
      float voiceLine = (1.0 - smoothstep(0.006, 0.024, abs(delta.y - voiceCurve)))
        * waveformEnvelope * uReveal * waveformMode;
      float voiceEdge = (1.0 - smoothstep(0.0, 0.025, abs(length(delta * vec2(0.68, 1.0)) - waveformRadius)))
        * uReveal * waveformMode;
      float radarRingGlow = (1.0 - smoothstep(0.0, 0.022, abs(fract(distanceToTouch * 16.0 - uTime * 0.22) - 0.5)))
        * radarEnvelope * uReveal * radarMode;
      float radarSweepGlow = pow(max(0.0, cos(sweepAngle)), 42.0)
        * radarEnvelope * uReveal * radarMode;
      float radarEdge = (1.0 - smoothstep(0.0, 0.022, abs(distanceToTouch - radarRadius)))
        * uReveal * radarMode;
      float chainNodeEdge = (1.0 - smoothstep(0.0, 0.055, abs(length(chainLocal) - 0.405)))
        * chainReach * uReveal * chainMode;
      float chainFront = (1.0 - smoothstep(0.0, 0.042, abs(chainDistance - chainRadius)))
        * uReveal * chainMode;
      float chainLink = max(
        1.0 - smoothstep(0.035, 0.075, abs(chainLocal.x)),
        1.0 - smoothstep(0.035, 0.075, abs(chainLocal.y))
      ) * (1.0 - chainNode) * chainReach * uReveal * chainMode;
      float bondLeftRim = 1.0 - smoothstep(0.0, 0.02, abs(bondLeftDistance - bondRadius));
      float bondRightRim = 1.0 - smoothstep(0.0, 0.02, abs(bondRightDistance - bondRadius));
      float bondWindow = 1.0 - smoothstep(bondOffset, bondOffset + 0.04, abs(delta.x));
      float bondHelixA = 1.0 - smoothstep(
        0.006,
        0.019,
        abs(delta.y - sin(delta.x * 54.0 - uTime * 3.0) * 0.028)
      );
      float bondHelixB = 1.0 - smoothstep(
        0.006,
        0.019,
        abs(delta.y + sin(delta.x * 54.0 - uTime * 3.0) * 0.028)
      );
      float bondGlow = max(bondLeftRim, bondRightRim) * uReveal * bondMode;
      float bondBridge = max(bondHelixA, bondHelixB) * bondWindow * uReveal * bondMode;
      float shardAngularEdge = 1.0 - smoothstep(0.0, 0.075, min(shardSector, 1.0 - shardSector));
      float shardRadialEdge = 1.0 - smoothstep(0.0, 0.075, min(shardBand, 1.0 - shardBand));
      float shardEdge = max(shardAngularEdge, shardRadialEdge) * shardReach * uReveal * shardsMode;
      float shardFront = (1.0 - smoothstep(0.0, 0.038, abs(distanceToTouch - shardRadius)))
        * uReveal * shardsMode;
      float coinRim = (1.0 - smoothstep(0.0, 0.022, abs(coinDistance - coinRadius)))
        * uReveal * decisionMode;
      float decisionSplit = (1.0 - smoothstep(0.006, 0.025, abs(coinPoint.x)))
        * decisionHole * uReveal * decisionMode;
      float smokeEdge = smoothstep(0.08, 0.48, smokeHole) * (1.0 - smoothstep(0.55, 0.94, smokeHole))
        * uReveal * smokeMode;
      float smokeWisp = (0.5 + 0.5 * sin(delta.x * 48.0 + delta.y * 19.0 - uTime * 2.1))
        * smokeEdge * smokeMode;
      float truthDivider = (1.0 - smoothstep(0.005, 0.022, abs(delta.x + delta.y)))
        * truthEnvelope * uReveal * truthMode;
      float truthDiamond = (1.0 - smoothstep(0.0, 0.026, abs(truthDistance - truthSize)))
        * uReveal * truthMode;
      float truthScanGlow = pow(max(0.0, truthScan), 12.0) * truthEnvelope * uReveal * truthMode;
      vec2 dominoUv = fract(vUv * dominoGridSize);
      float dominoEdgeDistance = min(min(dominoUv.x, 1.0 - dominoUv.x), min(dominoUv.y, 1.0 - dominoUv.y));
      float dominoEdge = (1.0 - smoothstep(0.01, 0.055, dominoEdgeDistance))
        * dominoReach * uReveal * dominoMode;
      float dominoFront = (1.0 - smoothstep(0.0, 0.038, abs(dominoDistance - sharedRadius)))
        * uReveal * dominoMode;
      color += uAccent * rim * 0.92;
      color += mix(uAccent, vec3(1.0, 0.82, 0.36), 0.55) * ripple * 0.22;
      color += mix(uAccent, vec3(1.0, 0.82, 0.45), 0.42) * gridScan * 0.18;
      color += uAccent * voiceEdge * 0.18;
      color += mix(uAccent, vec3(0.38, 0.78, 1.0), 0.66) * radarEdge * 0.26;
      color += uAccent * chainFront * 0.25;
      color += mix(uAccent, vec3(1.0, 0.42, 0.72), 0.56) * bondGlow * 0.34;
      color += uAccent * shardFront * 0.2;
      color += mix(uAccent, vec3(1.0, 0.78, 0.32), 0.6) * coinRim * 0.38;
      color += mix(uAccent, vec3(0.62, 0.78, 0.66), 0.72) * smokeEdge * 0.12;
      color += uAccent * truthDiamond * 0.28;
      color += mix(uAccent, vec3(1.0, 0.86, 0.48), 0.62) * dominoEdge * 0.16;
      color += mix(uAccent, vec3(1.0, 0.72, 0.24), 0.48) * dominoFront * 0.26;
      float linkedLight = (1.0 - smoothstep(0.12, 0.9, length(vUv - vec2(0.08, 0.92))))
        * uWorldHeat;
      color += mix(uAccent, vec3(1.0, 0.28, 0.04), 0.58) * linkedLight * 0.2;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export class InteractivePortalCover {
  readonly material: THREE.ShaderMaterial;
  private cover: THREE.Texture;
  private gameplay: THREE.Texture;
  private displayAspect = 1;
  private readonly pointerTarget = new THREE.Vector2(0.5, 0.5);
  private revealTarget = 0;
  private reveal = 0;

  constructor(
    cover: THREE.Texture,
    gameplay: THREE.Texture,
    accent: THREE.Color,
    gameplayExposure = 0.82,
    mode: PortalRevealMode = 'organic',
  ) {
    this.cover = cover;
    this.gameplay = gameplay;
    this.material = new THREE.ShaderMaterial({
      ...revealShader,
      uniforms: THREE.UniformsUtils.clone(revealShader.uniforms),
      toneMapped: false,
    });
    this.material.uniforms.tCover.value = cover;
    this.material.uniforms.tGameplay.value = gameplay;
    this.material.uniforms.uCoverScale.value.copy(cover.repeat);
    this.material.uniforms.uCoverOffset.value.copy(cover.offset);
    this.material.uniforms.uAccent.value.copy(accent);
    this.material.uniforms.uGameplayExposure.value = gameplayExposure;
    this.material.uniforms.uMode.value = portalRevealModeValue(mode);
    this.setDisplayAspect(1);
  }

  setDisplayAspect(targetAspect: number): void {
    this.displayAspect = targetAspect;
    this.fitTexture(this.cover, targetAspect);
    this.fitTexture(this.gameplay, targetAspect);
    this.material.uniforms.uCoverScale.value.copy(this.cover.repeat);
    this.material.uniforms.uCoverOffset.value.copy(this.cover.offset);
    this.material.uniforms.uGameplayScale.value.copy(this.gameplay.repeat);
    this.material.uniforms.uGameplayOffset.value.copy(this.gameplay.offset);
  }

  setTextures(cover: THREE.Texture, gameplay: THREE.Texture): void {
    this.cover = cover;
    this.gameplay = gameplay;
    this.material.uniforms.tCover.value = cover;
    this.material.uniforms.tGameplay.value = gameplay;
    this.setDisplayAspect(this.displayAspect);
  }

  setTouch(uv: THREE.Vector2 | null): void {
    this.revealTarget = uv ? 1 : 0;
    if (uv) this.pointerTarget.copy(uv);
  }

  update(delta: number, elapsed: number): void {
    const revealSpeed = this.revealTarget > this.reveal ? 12 : 6.5;
    this.reveal = THREE.MathUtils.lerp(this.reveal, this.revealTarget, 1 - Math.exp(-delta * revealSpeed));
    this.material.uniforms.uReveal.value = this.reveal;
    this.material.uniforms.uTime.value = elapsed;
    (this.material.uniforms.uPointer.value as THREE.Vector2).lerp(
      this.pointerTarget,
      1 - Math.exp(-delta * 18),
    );
  }

  setWorldHeat(heat: number): void {
    this.material.uniforms.uWorldHeat.value = THREE.MathUtils.clamp(heat, 0, 1.35);
  }

  dispose(): void {
    this.material.dispose();
  }

  private fitTexture(texture: THREE.Texture, targetAspect: number): void {
    const image = texture.image as { width?: number; height?: number } | undefined;
    const imageAspect = image?.width && image?.height ? image.width / image.height : targetAspect;
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);
    if (imageAspect > targetAspect) {
      texture.repeat.x = targetAspect / imageAspect;
      texture.offset.x = (1 - texture.repeat.x) * 0.5;
    } else if (imageAspect < targetAspect) {
      texture.repeat.y = imageAspect / targetAspect;
      texture.offset.y = (1 - texture.repeat.y) * 0.5;
    }
    texture.needsUpdate = true;
  }
}
