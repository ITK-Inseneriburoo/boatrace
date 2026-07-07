import * as THREE from "three";

const VERT = /* glsl */ `
attribute vec3 aVel;
attribute float aSpawnTime;
attribute float aLife;
attribute float aSize;
uniform float uTime;
uniform float uGravity;
varying float vAlpha;

void main() {
  float t = uTime - aSpawnTime;
  float k = t / max(aLife, 0.001);
  bool dead = t < 0.0 || k > 1.0;
  vec3 pos = position + aVel * t + vec3(0.0, uGravity, 0.0) * t * t * 0.5;
  vAlpha = (1.0 - k) * (1.0 - k);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = dead ? 0.0 : aSize * (140.0 / max(-mv.z, 1.0));
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec4 tex = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(uColor, tex.a * vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Pehme ümar sprite tekstuurina */
function softCircleTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * GPU-osakeste pool: kogu animatsioon vertex-shaderis, spawn = atribuudi
 * kirjutamine ring-puhvri kursorile. Üks draw call kogu pooli kohta.
 */
export class ParticlePool {
  readonly points: THREE.Points;
  private cursor = 0;
  private pos: THREE.BufferAttribute;
  private vel: THREE.BufferAttribute;
  private spawnT: THREE.BufferAttribute;
  private life: THREE.BufferAttribute;
  private size: THREE.BufferAttribute;
  private mat: THREE.ShaderMaterial;

  constructor(
    private N: number,
    color: number,
    gravity: number,
  ) {
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    this.vel = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    this.spawnT = new THREE.BufferAttribute(new Float32Array(N).fill(-1e9), 1);
    this.life = new THREE.BufferAttribute(new Float32Array(N).fill(1), 1);
    this.size = new THREE.BufferAttribute(new Float32Array(N).fill(1), 1);
    geo.setAttribute("position", this.pos);
    geo.setAttribute("aVel", this.vel);
    geo.setAttribute("aSpawnTime", this.spawnT);
    geo.setAttribute("aLife", this.life);
    geo.setAttribute("aSize", this.size);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uGravity: { value: gravity },
        uTex: { value: softCircleTexture() },
        uColor: { value: new THREE.Color(color) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number,
    size: number,
    time: number,
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.N;
    this.pos.setXYZ(i, x, y, z);
    this.vel.setXYZ(i, vx, vy, vz);
    this.spawnT.setX(i, time);
    this.life.setX(i, life);
    this.size.setX(i, size);
    this.pos.needsUpdate = true;
    this.vel.needsUpdate = true;
    this.spawnT.needsUpdate = true;
    this.life.needsUpdate = true;
    this.size.needsUpdate = true;
  }

  update(time: number): void {
    this.mat.uniforms.uTime.value = time;
  }
}
