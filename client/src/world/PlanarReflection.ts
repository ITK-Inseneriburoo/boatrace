import * as THREE from "three";

/**
 * Peegelpildi render-target vee jaoks: kaamera peegeldatakse y=0 tasandi
 * ümber ja stseen renderdatakse pool-/veerandresolutsioonis RT-sse
 * (sama matemaatika kui three'i Reflector, aga fikseeritud veepinnale ja
 * ilma oma mesh'ita — ookeanishader sämplib tulemust ise, häirides UV-d
 * lainenormaaliga, mis peidab madala resolutsiooni täielikult).
 * Oblique near-plane lõikab veealuse geomeetria peegeldusest välja.
 * HalfFloat, et HDR (päikeseketas) säiliks bloom'i jaoks.
 */
export class PlanarReflection {
  readonly target: THREE.WebGLRenderTarget;
  /** world → peegelduse UV (0..1) projektsioonimaatriks shaderile */
  readonly textureMatrix = new THREE.Matrix4();

  private virtualCamera = new THREE.PerspectiveCamera();
  private reflectorPlane = new THREE.Plane();
  private normal = new THREE.Vector3();
  private reflectorWorldPosition = new THREE.Vector3();
  private cameraWorldPosition = new THREE.Vector3();
  private rotationMatrix = new THREE.Matrix4();
  private lookAtPosition = new THREE.Vector3();
  private clipPlane = new THREE.Vector4();
  private view = new THREE.Vector3();
  private target3 = new THREE.Vector3();
  private q = new THREE.Vector4();

  constructor(res: number) {
    this.target = new THREE.WebGLRenderTarget(res, res, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }

  setSize(res: number): void {
    this.target.setSize(res, res);
  }

  dispose(): void {
    this.target.dispose();
  }

  /**
   * Renderda peegeldus. `hide` — objektid, mida peeglis ei näidata
   * (ookean ise, partiklid, vihm). Varjukaarte uuesti ei renderdata.
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    hide: THREE.Object3D[],
  ): void {
    // Peegeldustasand y=0, normaal üles
    this.reflectorWorldPosition.set(0, 0, 0);
    this.normal.set(0, 1, 0);
    this.cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
    if (this.cameraWorldPosition.y < 0.05) return; // kaamera vee all/pinnal — jäta vahele

    const view = this.view;
    view.subVectors(this.reflectorWorldPosition, this.cameraWorldPosition);
    view.reflect(this.normal).negate();
    view.add(this.reflectorWorldPosition);

    this.rotationMatrix.extractRotation(camera.matrixWorld);
    this.lookAtPosition.set(0, 0, -1).applyMatrix4(this.rotationMatrix).add(this.cameraWorldPosition);

    this.target3.subVectors(this.reflectorWorldPosition, this.lookAtPosition);
    this.target3.reflect(this.normal).negate();
    this.target3.add(this.reflectorWorldPosition);

    const vc = this.virtualCamera;
    vc.position.copy(view);
    vc.up.set(0, 1, 0).reflect(this.normal);
    vc.lookAt(this.target3);
    vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);

    // world → uv: [0.5 nihe] * proj * view
    this.textureMatrix.set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1,
    );
    this.textureMatrix.multiply(vc.projectionMatrix);
    this.textureMatrix.multiply(vc.matrixWorldInverse);

    // Oblique near-plane (Lengyel): lõika kõik y<0 peeglist välja
    this.reflectorPlane.setFromNormalAndCoplanarPoint(this.normal, this.reflectorWorldPosition);
    this.reflectorPlane.applyMatrix4(vc.matrixWorldInverse);
    this.clipPlane.set(
      this.reflectorPlane.normal.x,
      this.reflectorPlane.normal.y,
      this.reflectorPlane.normal.z,
      this.reflectorPlane.constant,
    );
    const projectionMatrix = vc.projectionMatrix;
    const q = this.q;
    q.x = (Math.sign(this.clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
    q.y = (Math.sign(this.clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
    q.z = -1.0;
    q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
    this.clipPlane.multiplyScalar(2.0 / this.clipPlane.dot(q));
    projectionMatrix.elements[2] = this.clipPlane.x;
    projectionMatrix.elements[6] = this.clipPlane.y;
    projectionMatrix.elements[10] = this.clipPlane.z + 1.0;
    projectionMatrix.elements[14] = this.clipPlane.w;

    const prevVisible = hide.map((o) => o.visible);
    for (const o of hide) o.visible = false;
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false; // varjukaardid on selle kaadri omad
    const prevTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, vc);

    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadowAuto;
    hide.forEach((o, i) => (o.visible = prevVisible[i]));
  }
}
