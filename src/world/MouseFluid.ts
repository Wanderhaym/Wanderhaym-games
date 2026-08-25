import * as THREE from 'three';

const simulationShader = {
  uniforms: {
    tPrevious: { value: null },
    uDelta: { value: 1 / 60 },
    uPointer: { value: new THREE.Vector2(0.5, 0.5) },
    uVelocity: { value: new THREE.Vector2() },
    uAspect: { value: 1 },
    uSplat: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tPrevious;
    uniform float uDelta;
    uniform vec2 uPointer;
    uniform vec2 uVelocity;
    uniform float uAspect;
    uniform float uSplat;
    varying vec2 vUv;

    void main() {
      vec2 previousVelocity = texture2D(tPrevious, vUv).xy;
      vec2 advectedUv = clamp(vUv - previousVelocity * uDelta * 0.48, 0.002, 0.998);
      vec4 previous = texture2D(tPrevious, advectedUv);
      vec2 velocity = previous.xy * pow(0.955, uDelta * 60.0);
      float dye = previous.z * pow(0.968, uDelta * 60.0);

      vec2 distanceToPointer = vUv - uPointer;
      distanceToPointer.x *= uAspect;
      float radius = dot(distanceToPointer, distanceToPointer);
      float splat = exp(-radius * 92.0) * uSplat;
      vec2 impulse = uVelocity * splat * 0.82;
      vec2 curl = vec2(-distanceToPointer.y, distanceToPointer.x) * splat * (0.85 + length(uVelocity) * 0.3);
      velocity += impulse + curl;
      velocity = clamp(velocity, vec2(-1.0), vec2(1.0));
      dye = max(dye, splat * (0.62 + min(0.38, length(uVelocity))));
      gl_FragColor = vec4(velocity, dye, 1.0);
    }
  `,
};

export class MouseFluid {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readTarget: THREE.WebGLRenderTarget;
  private writeTarget: THREE.WebGLRenderTarget;
  private splat = 0;
  private readonly pointer = new THREE.Vector2(0.5, 0.5);
  private readonly velocity = new THREE.Vector2();

  constructor(renderer: THREE.WebGLRenderer, size: number) {
    this.renderer = renderer;
    const options: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.readTarget = new THREE.WebGLRenderTarget(size, size, options);
    this.writeTarget = new THREE.WebGLRenderTarget(size, size, options);
    this.readTarget.texture.name = 'Wanderhaym mouse fluid A';
    this.writeTarget.texture.name = 'Wanderhaym mouse fluid B';
    this.material = new THREE.ShaderMaterial(simulationShader);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.clearTargets();
  }

  setPointer(uv: THREE.Vector2, velocity: THREE.Vector2): void {
    this.pointer.copy(uv);
    this.velocity.lerp(velocity, 0.72);
    this.splat = Math.min(1, this.splat + 0.78);
  }

  update(delta: number, aspect: number): void {
    this.material.uniforms.tPrevious.value = this.readTarget.texture;
    this.material.uniforms.uDelta.value = Math.min(delta, 1 / 30);
    this.material.uniforms.uPointer.value.copy(this.pointer);
    this.material.uniforms.uVelocity.value.copy(this.velocity);
    this.material.uniforms.uAspect.value = aspect;
    this.material.uniforms.uSplat.value = this.splat;

    const previousTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.writeTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previousTarget);
    [this.readTarget, this.writeTarget] = [this.writeTarget, this.readTarget];

    this.splat *= Math.exp(-delta * 11);
    this.velocity.multiplyScalar(Math.exp(-delta * 7));
  }

  get texture(): THREE.Texture {
    return this.readTarget.texture;
  }

  dispose(): void {
    this.readTarget.dispose();
    this.writeTarget.dispose();
    this.material.dispose();
    (this.scene.children[0] as THREE.Mesh).geometry.dispose();
  }

  private clearTargets(): void {
    const oldTarget = this.renderer.getRenderTarget();
    const oldColor = this.renderer.getClearColor(new THREE.Color()).clone();
    const oldAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setRenderTarget(this.readTarget);
    this.renderer.clear();
    this.renderer.setRenderTarget(this.writeTarget);
    this.renderer.clear();
    this.renderer.setRenderTarget(oldTarget);
    this.renderer.setClearColor(oldColor, oldAlpha);
  }
}
