import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const simulationShader = {
  uniforms: {
    tPrevious: { value: null },
    uDelta: { value: 1 / 60 },
    uTexel: { value: new THREE.Vector2() },
    uAspect: { value: 1 },
    uCurl: { value: 15 },
    uPointer0: { value: new THREE.Vector4(-2, -2, 0, 0) },
    uPointer1: { value: new THREE.Vector4(-2, -2, 0, 0) },
    uPointer2: { value: new THREE.Vector4(-2, -2, 0, 0) },
    uPointer3: { value: new THREE.Vector4(-2, -2, 0, 0) },
    uSplat0: { value: 0 },
    uSplat1: { value: 0 },
    uSplat2: { value: 0 },
    uSplat3: { value: 0 },
  },
  vertexShader,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tPrevious;
    uniform float uDelta;
    uniform vec2 uTexel;
    uniform float uAspect;
    uniform float uCurl;
    uniform vec4 uPointer0;
    uniform vec4 uPointer1;
    uniform vec4 uPointer2;
    uniform vec4 uPointer3;
    uniform float uSplat0;
    uniform float uSplat1;
    uniform float uSplat2;
    uniform float uSplat3;
    varying vec2 vUv;

    vec3 state(vec2 uv) {
      return texture2D(tPrevious, clamp(uv, uTexel, vec2(1.0) - uTexel)).xyz;
    }

    void addSplat(inout vec2 velocity, inout float dye, vec4 pointer, float power) {
      vec2 distanceToPointer = vUv - pointer.xy;
      distanceToPointer.x *= uAspect;
      float radius = dot(distanceToPointer, distanceToPointer);
      float splat = exp(-radius * 112.0) * power;
      vec2 swirl = vec2(-distanceToPointer.y, distanceToPointer.x)
        * splat * (0.42 + length(pointer.zw) * 0.2);
      velocity += pointer.zw * splat * 0.74 + swirl;
      dye = max(dye, splat * (0.56 + min(0.44, length(pointer.zw) * 0.28)));
    }

    void main() {
      vec2 previousVelocity = state(vUv).xy;
      vec2 advectedUv = vUv - previousVelocity * uDelta * 0.44;
      vec3 previous = state(advectedUv);
      vec2 velocity = previous.xy * pow(0.956, uDelta * 60.0);
      float dye = previous.z * pow(0.969, uDelta * 60.0);

      float leftY = state(vUv - vec2(uTexel.x, 0.0)).y;
      float rightY = state(vUv + vec2(uTexel.x, 0.0)).y;
      float bottomX = state(vUv - vec2(0.0, uTexel.y)).x;
      float topX = state(vUv + vec2(0.0, uTexel.y)).x;
      float vorticity = (rightY - leftY - topX + bottomX) * 0.5;
      vec2 curlForce = vec2(abs(topX) - abs(bottomX), abs(leftY) - abs(rightY));
      curlForce /= max(length(curlForce), 0.0001);
      velocity += curlForce * vorticity * uCurl * uDelta;

      addSplat(velocity, dye, uPointer0, uSplat0);
      addSplat(velocity, dye, uPointer1, uSplat1);
      addSplat(velocity, dye, uPointer2, uSplat2);
      addSplat(velocity, dye, uPointer3, uSplat3);
      gl_FragColor = vec4(clamp(velocity, vec2(-1.0), vec2(1.0)), dye, 1.0);
    }
  `,
};

const divergenceShader = {
  uniforms: {
    tVelocity: { value: null },
    uTexel: { value: new THREE.Vector2() },
  },
  vertexShader,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tVelocity;
    uniform vec2 uTexel;
    varying vec2 vUv;
    vec2 velocity(vec2 uv) {
      return texture2D(tVelocity, clamp(uv, uTexel, vec2(1.0) - uTexel)).xy;
    }
    void main() {
      float left = velocity(vUv - vec2(uTexel.x, 0.0)).x;
      float right = velocity(vUv + vec2(uTexel.x, 0.0)).x;
      float bottom = velocity(vUv - vec2(0.0, uTexel.y)).y;
      float top = velocity(vUv + vec2(0.0, uTexel.y)).y;
      gl_FragColor = vec4((right - left + top - bottom) * 0.5, 0.0, 0.0, 1.0);
    }
  `,
};

const pressureShader = {
  uniforms: {
    tPressure: { value: null },
    tDivergence: { value: null },
    uTexel: { value: new THREE.Vector2() },
  },
  vertexShader,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tPressure;
    uniform sampler2D tDivergence;
    uniform vec2 uTexel;
    varying vec2 vUv;
    float pressure(vec2 uv) {
      return texture2D(tPressure, clamp(uv, uTexel, vec2(1.0) - uTexel)).x;
    }
    void main() {
      float left = pressure(vUv - vec2(uTexel.x, 0.0));
      float right = pressure(vUv + vec2(uTexel.x, 0.0));
      float bottom = pressure(vUv - vec2(0.0, uTexel.y));
      float top = pressure(vUv + vec2(0.0, uTexel.y));
      float divergence = texture2D(tDivergence, vUv).x;
      gl_FragColor = vec4((left + right + bottom + top - divergence) * 0.25, 0.0, 0.0, 1.0);
    }
  `,
};

const projectionShader = {
  uniforms: {
    tState: { value: null },
    tPressure: { value: null },
    uTexel: { value: new THREE.Vector2() },
  },
  vertexShader,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tState;
    uniform sampler2D tPressure;
    uniform vec2 uTexel;
    varying vec2 vUv;
    float pressure(vec2 uv) {
      return texture2D(tPressure, clamp(uv, uTexel, vec2(1.0) - uTexel)).x;
    }
    void main() {
      vec3 state = texture2D(tState, vUv).xyz;
      float left = pressure(vUv - vec2(uTexel.x, 0.0));
      float right = pressure(vUv + vec2(uTexel.x, 0.0));
      float bottom = pressure(vUv - vec2(0.0, uTexel.y));
      float top = pressure(vUv + vec2(0.0, uTexel.y));
      state.xy -= vec2(right - left, top - bottom) * 0.5;
      gl_FragColor = vec4(state, 1.0);
    }
  `,
};

interface FluidSplat {
  pointer: THREE.Vector4;
  strength: number;
}

export class MouseFluid {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly simulationMaterial = new THREE.ShaderMaterial(simulationShader);
  private readonly divergenceMaterial = new THREE.ShaderMaterial(divergenceShader);
  private readonly pressureMaterial = new THREE.ShaderMaterial(pressureShader);
  private readonly projectionMaterial = new THREE.ShaderMaterial(projectionShader);
  private stateRead: THREE.WebGLRenderTarget;
  private stateWrite: THREE.WebGLRenderTarget;
  private pressureRead: THREE.WebGLRenderTarget;
  private pressureWrite: THREE.WebGLRenderTarget;
  private readonly divergenceTarget: THREE.WebGLRenderTarget;
  private readonly splats: FluidSplat[] = Array.from({ length: 4 }, () => ({
    pointer: new THREE.Vector4(-2, -2, 0, 0),
    strength: 0,
  }));
  private splatCursor = 0;
  private readonly texel: THREE.Vector2;
  private readonly pressureIterations: number;

  constructor(private readonly renderer: THREE.WebGLRenderer, size: number) {
    this.texel = new THREE.Vector2(1 / size, 1 / size);
    this.pressureIterations = size >= 180 ? 8 : size >= 110 ? 6 : 4;
    const options: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.stateRead = new THREE.WebGLRenderTarget(size, size, options);
    this.stateWrite = new THREE.WebGLRenderTarget(size, size, options);
    this.pressureRead = new THREE.WebGLRenderTarget(size, size, options);
    this.pressureWrite = new THREE.WebGLRenderTarget(size, size, options);
    this.divergenceTarget = new THREE.WebGLRenderTarget(size, size, options);
    this.stateRead.texture.name = 'Wanderhaym fluid state A';
    this.stateWrite.texture.name = 'Wanderhaym fluid state B';
    this.pressureRead.texture.name = 'Wanderhaym pressure A';
    this.pressureWrite.texture.name = 'Wanderhaym pressure B';
    this.divergenceTarget.texture.name = 'Wanderhaym divergence';
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.simulationMaterial);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.clearTargets();
  }

  setPointer(uv: THREE.Vector2, velocity: THREE.Vector2): void {
    const speed = velocity.length();
    if (speed < 0.0015) return;
    const splat = this.splats[this.splatCursor];
    splat.pointer.set(uv.x, uv.y, velocity.x, velocity.y);
    splat.strength = Math.min(1, 0.32 + speed * 0.72);
    this.splatCursor = (this.splatCursor + 1) % this.splats.length;
  }

  update(delta: number, aspect: number): void {
    const dt = Math.min(delta, 1 / 30);
    this.simulationMaterial.uniforms.tPrevious.value = this.stateRead.texture;
    this.simulationMaterial.uniforms.uDelta.value = dt;
    this.simulationMaterial.uniforms.uTexel.value.copy(this.texel);
    this.simulationMaterial.uniforms.uAspect.value = aspect;
    this.simulationMaterial.uniforms.uCurl.value = this.pressureIterations >= 8 ? 18 : 13;
    this.splats.forEach((splat, index) => {
      this.simulationMaterial.uniforms[`uPointer${index}`].value.copy(splat.pointer);
      this.simulationMaterial.uniforms[`uSplat${index}`].value = splat.strength;
    });
    this.render(this.simulationMaterial, this.stateWrite);
    [this.stateRead, this.stateWrite] = [this.stateWrite, this.stateRead];

    this.divergenceMaterial.uniforms.tVelocity.value = this.stateRead.texture;
    this.divergenceMaterial.uniforms.uTexel.value.copy(this.texel);
    this.render(this.divergenceMaterial, this.divergenceTarget);

    this.pressureMaterial.uniforms.tDivergence.value = this.divergenceTarget.texture;
    this.pressureMaterial.uniforms.uTexel.value.copy(this.texel);
    for (let iteration = 0; iteration < this.pressureIterations; iteration += 1) {
      this.pressureMaterial.uniforms.tPressure.value = this.pressureRead.texture;
      this.render(this.pressureMaterial, this.pressureWrite);
      [this.pressureRead, this.pressureWrite] = [this.pressureWrite, this.pressureRead];
    }

    this.projectionMaterial.uniforms.tState.value = this.stateRead.texture;
    this.projectionMaterial.uniforms.tPressure.value = this.pressureRead.texture;
    this.projectionMaterial.uniforms.uTexel.value.copy(this.texel);
    this.render(this.projectionMaterial, this.stateWrite);
    [this.stateRead, this.stateWrite] = [this.stateWrite, this.stateRead];

    this.splats.forEach((splat) => {
      splat.strength *= Math.exp(-delta * 15);
      splat.pointer.z *= Math.exp(-delta * 8);
      splat.pointer.w *= Math.exp(-delta * 8);
    });
  }

  get texture(): THREE.Texture {
    return this.stateRead.texture;
  }

  dispose(): void {
    this.stateRead.dispose();
    this.stateWrite.dispose();
    this.pressureRead.dispose();
    this.pressureWrite.dispose();
    this.divergenceTarget.dispose();
    this.simulationMaterial.dispose();
    this.divergenceMaterial.dispose();
    this.pressureMaterial.dispose();
    this.projectionMaterial.dispose();
    this.quad.geometry.dispose();
  }

  private render(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
    const previousTarget = this.renderer.getRenderTarget();
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previousTarget);
  }

  private clearTargets(): void {
    const previousTarget = this.renderer.getRenderTarget();
    const previousColor = this.renderer.getClearColor(new THREE.Color()).clone();
    const previousAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    [this.stateRead, this.stateWrite, this.pressureRead, this.pressureWrite, this.divergenceTarget]
      .forEach((target) => {
        this.renderer.setRenderTarget(target);
        this.renderer.clear();
      });
    this.renderer.setRenderTarget(previousTarget);
    this.renderer.setClearColor(previousColor, previousAlpha);
  }
}
