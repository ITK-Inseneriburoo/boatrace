import * as THREE from "three";

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

/**
 * Renderer + stseen + fixed-timestep simulatsiooniloop.
 * Simulatsioon jookseb alati 60Hz sammudega (akumulaator);
 * render toimub iga kaadri kohta ja saab interpolatsiooni-alpha.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  /** Simulatsiooniaeg sekundites (kasvab fikseeritud sammudega) */
  simTime = 0;

  onUpdate: (dt: number) => void = () => {};
  onRender: (alpha: number, frameDt: number) => void = () => {};

  private accumulator = 0;
  private lastTime = 0;
  private running = false;

  /** Libisev keskmine FPS automaatseks kvaliteedilangetuseks */
  avgFps = 60;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      4000,
    );
    this.camera.position.set(0, 5, 12);

    window.addEventListener("resize", this.onResize);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.renderer.setAnimationLoop(this.tick);
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private tick = (): void => {
    const now = performance.now();
    let frameDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    // Tab-switchi järel ära püüa sadu samme järele teha
    if (frameDt > 0.25) frameDt = 0.25;

    if (frameDt > 0) {
      this.avgFps = this.avgFps * 0.97 + (1 / frameDt) * 0.03;
    }

    this.accumulator += frameDt;
    while (this.accumulator >= SIM_DT) {
      this.simTime += SIM_DT;
      this.onUpdate(SIM_DT);
      this.accumulator -= SIM_DT;
    }

    this.onRender(this.accumulator / SIM_DT, frameDt);
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  setPixelRatioCap(cap: number): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
