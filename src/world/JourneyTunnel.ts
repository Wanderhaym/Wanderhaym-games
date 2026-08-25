import * as THREE from 'three';
import type { JourneyFrame } from './CameraJourney';
import type { TransitionProfile } from './TransitionSystem';

const tunnelShader = {
  uniforms: {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uIntensity: { value: 0 },
    uBend: { value: 1 },
    uRadius: { value: 1 },
    uStreak: { value: 1 },
    uAccent: { value: new THREE.Color(0x82ffd0) },
  },
  vertexShader: `
    uniform float uTime;
    uniform float uProgress;
    uniform float uIntensity;
    uniform float uBend;
    uniform float uRadius;
    uniform float uStreak;
    attribute float aSeed;
    attribute float aTail;
    varying float vAlpha;
    varying float vHeat;

    void main() {
      float cycle = fract(position.z + uProgress * 1.72 + uTime * 0.018 + aSeed * 0.04);
      float depth = mix(1.2, 48.0, cycle);
      float radius = position.y * mix(0.4, 5.6, cycle) * uRadius;
      float bend = sin(cycle * 5.0 + aSeed * 19.0) * uIntensity * 0.32 * uBend;
      float streak = aTail * (1.4 + uIntensity * 10.5) * uStreak;
      vec3 transformed = vec3(
        cos(position.x) * radius + bend,
        sin(position.x) * radius + cos(aSeed * 23.0) * bend,
        -depth - streak
      );
      float gate = smoothstep(0.01, 0.12, cycle) * (1.0 - smoothstep(0.78, 0.99, cycle));
      vAlpha = gate * uIntensity * mix(0.24, 0.9, aSeed);
      vHeat = 1.0 - cycle;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uAccent;
    varying float vAlpha;
    varying float vHeat;

    void main() {
      vec3 hot = mix(uAccent, vec3(1.0, 0.58, 0.16), pow(vHeat, 4.0) * 0.68);
      gl_FragColor = vec4(hot * (1.15 + vHeat * 1.35), vAlpha);
    }
  `,
};

export class JourneyTunnel {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly streaks: THREE.LineSegments;
  private profile: TransitionProfile = {
    route: 'tunnel',
    durationScale: 1,
    warp: 1,
    twist: 0,
    chromatic: 1,
    tunnelEnergy: 1,
    roll: 0.1,
    collapse: 1,
    fovKick: 10,
    cameraShake: 0.14,
  };

  constructor(count: number) {
    const lineCount = Math.max(120, count);
    const positions = new Float32Array(lineCount * 2 * 3);
    const seeds = new Float32Array(lineCount * 2);
    const tails = new Float32Array(lineCount * 2);

    for (let index = 0; index < lineCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.48 + Math.pow(Math.random(), 0.62) * 2.5;
      const depth = Math.random();
      const seed = Math.random();
      for (let endpoint = 0; endpoint < 2; endpoint += 1) {
        const offset = (index * 2 + endpoint) * 3;
        positions[offset] = angle;
        positions[offset + 1] = radius;
        positions[offset + 2] = depth;
        seeds[index * 2 + endpoint] = seed;
        tails[index * 2 + endpoint] = endpoint;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aTail', new THREE.BufferAttribute(tails, 1));
    this.material = new THREE.ShaderMaterial({
      ...tunnelShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.streaks = new THREE.LineSegments(geometry, this.material);
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 1000;
    this.group.name = 'Camera hyperspace particle tunnel';
    this.group.visible = false;
    this.group.add(this.streaks);
  }

  setAccent(accent: THREE.Color): void {
    this.material.uniforms.uAccent.value.copy(accent);
  }

  setProfile(profile: TransitionProfile): void {
    this.profile = profile;
    const route = profile.route;
    const tunnelShape: Record<TransitionProfile['route'], [number, number, number]> = {
      tunnel: [1, 1, 1.24],
      orbit: [0.48, 1.42, 0.62],
      dive: [1.35, 0.88, 1],
      'fly-through': [0.86, 1.06, 1.24],
      spiral: [2.15, 1, 1.06],
      'close-pass': [1.08, 0.72, 0.92],
      rift: [0.18, 1.55, 0.5],
      slingshot: [0.72, 0.62, 1.35],
      ascent: [0.55, 0.82, 0.72],
      recoil: [1.65, 1.12, 1.3],
    };
    const [bend, radius, streak] = tunnelShape[route];
    this.material.uniforms.uBend.value = bend;
    this.material.uniforms.uRadius.value = radius;
    this.material.uniforms.uStreak.value = streak;
  }

  update(elapsed: number, frame: JourneyFrame): void {
    const envelope = Math.pow(Math.sin(frame.progress * Math.PI), 0.62);
    const intensity = frame.active && frame.mode === 'space'
      ? Math.max(frame.intensity, envelope * 0.72) * this.profile.tunnelEnergy
      : 0;
    this.group.visible = intensity > 0.01;
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uProgress.value = frame.progress;
    this.material.uniforms.uIntensity.value = intensity;
    this.group.position.set(0, 0, 0);
    this.group.scale.set(1, 1, 1);
    if (frame.route === 'spiral') {
      this.group.rotation.z = frame.progress * Math.PI * 1.7 * Math.sign(this.profile.twist || 1);
    } else if (frame.route === 'orbit') {
      this.group.rotation.z = Math.sin(frame.progress * Math.PI * 2) * 0.16;
      this.group.scale.set(1.35, 0.68, 1);
    } else if (frame.route === 'dive') {
      this.group.rotation.z = Math.sin(frame.progress * Math.PI) * 0.1;
      this.group.scale.set(0.86, 1.22, 1);
      this.group.position.y = Math.sin(frame.progress * Math.PI * 2) * 0.28;
    } else if (frame.route === 'close-pass') {
      this.group.rotation.z = -Math.sin(frame.progress * Math.PI) * 0.2;
      this.group.scale.set(0.72, 1.18, 1);
      this.group.position.x = Math.sin(frame.progress * Math.PI * 2) * 0.42;
    } else if (frame.route === 'rift') {
      const rupture = frame.progress < 0.5 ? -1 : 1;
      const envelope = Math.sin(frame.progress * Math.PI);
      this.group.rotation.z = rupture * 0.08;
      this.group.scale.set(1.58, 0.34 + envelope * 0.08, 1);
      this.group.position.x = rupture * envelope * 0.58;
      this.group.position.y = Math.sin(frame.progress * Math.PI * 4) * 0.12;
    } else if (frame.route === 'slingshot') {
      const envelope = Math.sin(frame.progress * Math.PI);
      this.group.rotation.z = Math.sin(frame.progress * Math.PI * 1.35) * 0.54;
      this.group.scale.set(0.64 + envelope * 0.22, 1.34 - envelope * 0.18, 1);
      this.group.position.x = Math.sin(frame.progress * Math.PI * 2) * envelope * 0.72;
      this.group.position.y = envelope * 0.34;
    } else if (frame.route === 'ascent') {
      const envelope = Math.sin(frame.progress * Math.PI);
      this.group.rotation.z = Math.sin(frame.progress * Math.PI * 2) * 0.045;
      this.group.scale.set(0.7, 1.5 + envelope * 0.12, 1);
      this.group.position.y = envelope * 0.82;
    } else if (frame.route === 'recoil') {
      const decay = Math.pow(1 - frame.progress, 1.15);
      const kick = Math.sin(frame.progress * Math.PI * 6) * decay;
      this.group.rotation.z = kick * 0.24;
      this.group.scale.set(1.08 + Math.abs(kick) * 0.22, 0.92 - Math.abs(kick) * 0.08, 1);
      this.group.position.x = kick * 0.48;
    } else {
      this.group.rotation.z = Math.sin(frame.progress * Math.PI * 2) * 0.075;
    }
  }

  dispose(): void {
    this.streaks.geometry.dispose();
    this.material.dispose();
  }
}
