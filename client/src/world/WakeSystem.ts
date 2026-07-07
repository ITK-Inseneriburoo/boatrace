import * as THREE from "three";

/**
 * Kiiluvee jälg: maailmafikseeritud ülalt-alla render-target kogu raja ala
 * kohta. Iga paat templib ahtrisse heledaid laike; kaader haaval hääbub
 * poolläbipaistva musta quadiga. Ookeanishader loeb sealt vahuintensiivsust.
 */
export class WakeSystem {
  readonly texture: THREE.Texture;
  readonly worldMin: number;
  readonly worldSize: number;

  private rt: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private fadeQuad: THREE.Mesh;
  private stamps: THREE.Mesh[] = [];
  private stampCursor = 0;
  private stampMat: THREE.MeshBasicMaterial;

  constructor(worldSize: number) {
    this.worldSize = worldSize;
    this.worldMin = -worldSize / 2;
    const RES = 2048;
    this.rt = new THREE.WebGLRenderTarget(RES, RES, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    this.texture = this.rt.texture;

    const half = worldSize / 2;
    this.camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 50);
    this.camera.position.set(0, 10, 0);
    // Ülalt alla: ekraani parem = +X, tekstuuri v=1 = maailma -Z
    // (ookeanishaderis kompenseeritakse negatiivse v-skaalaga)
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);

    // Hääbumiskiht
    this.fadeQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(worldSize, worldSize),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        // ~8s nähtav jälg 60fps juures
        opacity: 0.007,
        depthTest: false,
      }),
    );
    this.fadeQuad.rotation.x = -Math.PI / 2;
    this.fadeQuad.position.y = 1;
    this.fadeQuad.renderOrder = 0;
    this.scene.add(this.fadeQuad);

    // Templid: taaskasutatav hulk pehmeid laike
    const stampGeo = new THREE.PlaneGeometry(1, 1);
    const tex = softTexture();
    this.stampMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(stampGeo, this.stampMat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 2;
      m.visible = false;
      m.renderOrder = 1;
      this.scene.add(m);
      this.stamps.push(m);
    }
  }

  /** Alusta kaadrit: peida templid */
  begin(): void {
    for (const s of this.stamps) s.visible = false;
    this.stampCursor = 0;
  }

  /** Templi paadi kiiluvesi (kutsu iga paadi kohta) */
  stamp(x: number, z: number, yaw: number, speedRatio: number): void {
    if (speedRatio < 0.15 || this.stampCursor >= this.stamps.length) return;
    const s = this.stamps[this.stampCursor++];
    s.visible = true;
    // Ahtri taha
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    s.position.set(x - fx * 2.2, 2, z - fz * 2.2);
    s.rotation.z = -yaw;
    const w = 3.2 + speedRatio * 2.2;
    s.scale.set(w, w * 1.7, 1);
    (s.material as THREE.MeshBasicMaterial).opacity = 0.16 + speedRatio * 0.3;
  }

  /** Renderda jälje uuendus (kutsu pärast kõiki stamp() kutseid) */
  render(renderer: THREE.WebGLRenderer): void {
    const prev = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
    renderer.autoClear = prevAutoClear;
  }

  clear(renderer: THREE.WebGLRenderer): void {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, false, false);
    renderer.setRenderTarget(prev);
  }
}

function softTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.3)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
