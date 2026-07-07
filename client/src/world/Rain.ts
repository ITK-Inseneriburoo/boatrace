import * as THREE from "three";

const VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
attribute float aSpeed;
varying float vAlpha;

void main() {
  // Langeb pidevalt, mähitakse 25m kõrguse kasti sisse
  vec3 p = position;
  p.y = mod(p.y - uTime * aSpeed, 25.0);
  p += uCenter;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = clamp(90.0 / max(d, 1.0), 1.5, 7.0);
  vAlpha = smoothstep(45.0, 8.0, d) * 0.55;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uTex;
varying float vAlpha;
void main() {
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(0.75, 0.82, 0.9, t.a * vAlpha);
}
`;

/** Venitatud piisake-sprite */
function streakTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(6, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

/** Vihm: punktisprite'id kaamera ümbruses, Y mähitud shaderis */
export class Rain {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;

  constructor(count: number) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 44;
      pos[i * 3 + 1] = Math.random() * 25;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 44;
      speed[i] = 16 + Math.random() * 9;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uTex: { value: streakTexture() },
      },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  setEnabled(on: boolean): void {
    this.points.visible = on;
  }

  update(time: number, camPos: THREE.Vector3): void {
    if (!this.points.visible) return;
    this.mat.uniforms.uTime.value = time;
    (this.mat.uniforms.uCenter.value as THREE.Vector3).set(
      camPos.x - 22,
      camPos.y - 14,
      camPos.z - 22,
    );
  }
}
