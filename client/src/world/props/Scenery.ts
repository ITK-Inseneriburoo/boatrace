import * as THREE from "three";
import type { TrackId, WeatherId } from "@shared/types";
import { mulberry32 } from "@shared/math";
import { getWaveHeight, type WaveSet } from "@shared/waves";
import { balloonLogoTexture } from "../../core/Brand";
import type { Terrain } from "../Terrain";

interface WingPair {
  left: THREE.Object3D;
  right: THREE.Object3D;
  phase: number;
}

interface BirdFlock {
  root: THREE.Group;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  altitude: number;
  speed: number;
  phase: number;
  wings: WingPair[];
}

interface Orbiter {
  root: THREE.Group;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  altitude: number;
  speed: number;
  phase: number;
  bob: number;
}

interface Floater {
  root: THREE.Group;
  centerX: number;
  centerZ: number;
  radiusX: number;
  radiusZ: number;
  speed: number;
  phase: number;
  yOffset: number;
}

interface Gondola {
  root: THREE.Group;
  curve: THREE.QuadraticBezierCurve3;
  speed: number;
  phase: number;
}

const white = new THREE.MeshStandardMaterial({ color: 0xf3f7f6, roughness: 0.72 });
const dark = new THREE.MeshStandardMaterial({ color: 0x26343b, roughness: 0.78 });
const teal = new THREE.MeshStandardMaterial({ color: 0x20b7ab, roughness: 0.58 });
const orange = new THREE.MeshStandardMaterial({ color: 0xe9782d, roughness: 0.62 });
const wood = new THREE.MeshStandardMaterial({ color: 0x6c4930, roughness: 0.9 });
const glass = new THREE.MeshStandardMaterial({ color: 0x173847, roughness: 0.16, metalness: 0.35 });
const cableMat = new THREE.MeshStandardMaterial({ color: 0x31383d, roughness: 0.45, metalness: 0.7 });
const birdWhite = new THREE.MeshStandardMaterial({ color: 0xe8eceb, roughness: 0.85, side: THREE.DoubleSide });
const birdDark = new THREE.MeshStandardMaterial({ color: 0x3b3029, roughness: 0.9, side: THREE.DoubleSide });

const birdBodyGeo = new THREE.SphereGeometry(1, 8, 6);
const beakGeo = new THREE.ConeGeometry(0.12, 0.45, 5);
const leftWingGeo = new THREE.BufferGeometry();
leftWingGeo.setAttribute(
  "position",
  new THREE.Float32BufferAttribute([0, 0, 0, -1.35, 0, 0.15, -0.22, 0, -0.72], 3),
);
leftWingGeo.computeVertexNormals();
const rightWingGeo = new THREE.BufferGeometry();
rightWingGeo.setAttribute(
  "position",
  new THREE.Float32BufferAttribute([0, 0, 0, 0.22, 0, -0.72, 1.35, 0, 0.15], 3),
);
rightWingGeo.computeVertexNormals();

let balloonLogoMaterial: Promise<THREE.MeshBasicMaterial | null> | null = null;

function getBalloonLogoMaterial(): Promise<THREE.MeshBasicMaterial | null> {
  if (!balloonLogoMaterial) {
    balloonLogoMaterial = balloonLogoTexture().then((map) =>
      map
        ? new THREE.MeshBasicMaterial({
            map,
            transparent: true,
            alphaTest: 0.02,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        : null,
    );
  }
  return balloonLogoMaterial;
}

function buildBird(kind: "kajakas" | "kotkas"): { root: THREE.Group; wings: WingPair } {
  const root = new THREE.Group();
  const material = kind === "kajakas" ? birdWhite : birdDark;
  const body = new THREE.Mesh(birdBodyGeo, material);
  body.scale.set(kind === "kajakas" ? 0.32 : 0.45, 0.2, kind === "kajakas" ? 0.72 : 0.95);
  root.add(body);

  const left = new THREE.Mesh(leftWingGeo, material);
  const right = new THREE.Mesh(rightWingGeo, material);
  left.position.x = -0.12;
  right.position.x = 0.12;
  const wingScale = kind === "kajakas" ? 1 : 1.35;
  left.scale.setScalar(wingScale);
  right.scale.setScalar(wingScale);
  root.add(left, right);

  const beak = new THREE.Mesh(beakGeo, kind === "kajakas" ? orange : dark);
  beak.rotation.x = Math.PI / 2;
  beak.position.z = kind === "kajakas" ? 0.82 : 1.02;
  root.add(beak);
  return { root, wings: { left, right, phase: 0 } };
}

function buildBalloon(colors: [number, number]): THREE.Group {
  const root = new THREE.Group();
  const panelMaterials = colors.map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.68, side: THREE.DoubleSide }),
  );
  for (let i = 0; i < 8; i++) {
    const panel = new THREE.Mesh(
      new THREE.SphereGeometry(1, 4, 12, (i * Math.PI) / 4, Math.PI / 4 + 0.012),
      panelMaterials[i % 2],
    );
    panel.scale.set(7, 9, 7);
    root.add(panel);
  }

  const burner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.7, 1.2, 8),
    new THREE.MeshStandardMaterial({
      color: 0x44494d,
      emissive: 0xff8b24,
      emissiveIntensity: 0.7,
      roughness: 0.4,
      metalness: 0.65,
    }),
  );
  burner.position.y = -9.2;
  root.add(burner);

  for (const x of [-1.1, 1.1]) {
    for (const z of [-0.9, 0.9]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.5, 4), wood);
      rope.position.set(x, -10.3, z);
      root.add(rope);
    }
  }
  const basket = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 2.8), wood);
  basket.position.y = -12;
  root.add(basket);

  void getBalloonLogoMaterial().then((material) => {
    if (!material) return;
    const geo = new THREE.PlaneGeometry(3.2, 3.2);
    // Paneelid 0, 2, 4 ja 6 kasutavad colors[0] värvi. Märgi keskpunkt
    // järgib täpselt SphereGeometry sama phi-nurka, et valge logo ei
    // satuks heleda triibu ega kahe paneeli ühenduskoha peale.
    for (const panel of [0, 2, 4, 6]) {
      const angle = ((panel + 0.5) * Math.PI) / 4;
      const x = -Math.cos(angle) * 7.04;
      const z = Math.sin(angle) * 7.04;
      const logo = new THREE.Mesh(geo, material);
      logo.position.set(x, -0.2, z);
      logo.rotation.y = Math.atan2(x, z);
      root.add(logo);
    }
  });
  return root;
}

function buildSailboat(color: number): THREE.Group {
  const root = new THREE.Group();
  const hullMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.58 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.1, 7.4), hullMaterial);
  hull.position.y = 0.45;
  root.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.8, 4), hullMaterial);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.45, 5);
  root.add(bow);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 8.5, 6), wood);
  mast.position.set(0, 4.5, 0.2);
  root.add(mast);
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0.15, 8.2, 0, 0.15, 1.2, 0, 4.1, 1.7, 0], 3),
  );
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(
    sailGeo,
    new THREE.MeshStandardMaterial({ color: 0xf5eee1, roughness: 0.8, side: THREE.DoubleSide }),
  );
  sail.position.z = 0.2;
  root.add(sail);
  return root;
}

function buildTugboat(): THREE.Group {
  const root = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.1, 10), dark);
  hull.position.y = 0.8;
  root.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(2.25, 3.2, 4), dark);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.8, 6.2);
  root.add(bow);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.5, 3.2, 4), white);
  cabin.position.set(0, 3.1, -0.8);
  root.add(cabin);
  const windows = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.2, 2.7), glass);
  windows.position.set(0, 3.55, -0.45);
  root.add(windows);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.2, 8), orange);
  funnel.position.set(0, 5.5, -1.5);
  root.add(funnel);
  return root;
}

export class TrackScenery {
  readonly group = new THREE.Group();

  private readonly detailGroup = new THREE.Group();
  private readonly extraGroup = new THREE.Group();
  private readonly calmGroup = new THREE.Group();
  private readonly calmExtraGroup = new THREE.Group();
  private readonly sunnyGroup = new THREE.Group();
  private readonly sunnyExtraGroup = new THREE.Group();
  private readonly flocks: BirdFlock[] = [];
  private readonly balloons: Orbiter[] = [];
  private readonly floaters: Floater[] = [];
  private readonly rotors: { root: THREE.Object3D; speed: number; phase: number }[] = [];
  private readonly gondolas: Gondola[] = [];
  private readonly waterfallMaterials: THREE.ShaderMaterial[] = [];

  private weather: WeatherId = "paike";
  private detailScale = 1;
  private readonly rnd: () => number;

  constructor(trackId: TrackId, seed: number, terrain: Terrain) {
    this.rnd = mulberry32(seed + 8128);
    this.group.name = "rajadekoratsioonid";
    this.group.add(
      this.detailGroup,
      this.extraGroup,
      this.calmGroup,
      this.calmExtraGroup,
      this.sunnyGroup,
      this.sunnyExtraGroup,
    );

    switch (trackId) {
      case "saarestik":
        this.addBirdFlock("kajakas", 0, 0, 330, 270, 42, 7, this.calmGroup);
        this.addBirdFlock("kajakas", 40, -30, 230, 190, 58, 5, this.calmExtraGroup);
        this.addFloater(buildSailboat(0x245ea8), -335, -175, 26, 18, 0.035, this.detailGroup);
        this.addFloater(buildSailboat(0xc54c3c), 315, 160, 22, 15, -0.03, this.extraGroup);
        this.addBalloon(0, 0, 310, 235, 96, [0x147f91, 0xf2efe7], this.sunnyGroup);
        this.addBalloon(20, -10, 225, 180, 128, [0xe1783c, 0xf4dd82], this.sunnyExtraGroup);
        break;
      case "sadamalinn":
        this.buildHarborRadar(terrain, 245, -352);
        this.addBirdFlock("kajakas", 0, -30, 300, 230, 38, 8, this.calmGroup);
        this.addBirdFlock("kajakas", -40, 20, 210, 165, 52, 5, this.calmExtraGroup);
        this.addFloater(buildTugboat(), 315, -205, 34, 20, 0.025, this.detailGroup, 0.7);
        this.addBalloon(0, 0, 345, 275, 112, [0x1c8092, 0xf0eee6], this.sunnyGroup);
        break;
      case "joekanjon":
        this.buildWaterfall(terrain, 145, 35);
        this.addBirdFlock("kotkas", 0, 0, 270, 190, 62, 5, this.calmGroup);
        this.addBirdFlock("kotkas", -30, 20, 175, 130, 78, 3, this.calmExtraGroup);
        this.addBalloon(0, 0, 315, 225, 112, [0x9c413d, 0xf0b34f], this.sunnyGroup);
        break;
      case "fjord":
        this.buildCableCar(terrain);
        this.addBirdFlock("kotkas", 0, 0, 360, 250, 88, 5, this.calmGroup);
        this.addBirdFlock("kotkas", 30, -20, 240, 180, 112, 3, this.calmExtraGroup);
        this.addBalloon(0, 0, 390, 290, 142, [0x1b6a87, 0xe9f1ef], this.sunnyGroup);
        this.addBalloon(-30, 15, 275, 215, 175, [0xb6463b, 0xf0c85d], this.sunnyExtraGroup);
        break;
    }
    this.applyVisibility();
  }

  setWeather(weather: WeatherId): void {
    this.weather = weather;
    this.applyVisibility();
  }

  setDetailScale(scale: number): void {
    this.detailScale = scale;
    this.applyVisibility();
  }

  update(waves: WaveSet, time: number): void {
    for (const flock of this.flocks) {
      const a = time * flock.speed + flock.phase;
      flock.root.position.set(
        flock.centerX + Math.cos(a) * flock.radiusX,
        flock.altitude + Math.sin(time * 0.45 + flock.phase) * 2.5,
        flock.centerZ + Math.sin(a) * flock.radiusZ,
      );
      const direction = Math.sign(flock.speed);
      flock.root.rotation.y = Math.atan2(
        -Math.sin(a) * flock.radiusX * direction,
        Math.cos(a) * flock.radiusZ * direction,
      );
      for (const wing of flock.wings) {
        const flap = Math.sin(time * 5.6 + wing.phase) * 0.58;
        wing.left.rotation.z = flap;
        wing.right.rotation.z = -flap;
      }
    }

    for (const balloon of this.balloons) {
      const a = time * balloon.speed + balloon.phase;
      balloon.root.position.set(
        balloon.centerX + Math.cos(a) * balloon.radiusX,
        balloon.altitude + Math.sin(time * 0.22 + balloon.phase) * balloon.bob,
        balloon.centerZ + Math.sin(a) * balloon.radiusZ,
      );
      balloon.root.rotation.y = -a * 0.18;
    }

    for (const floater of this.floaters) {
      const a = time * floater.speed + floater.phase;
      const x = floater.centerX + Math.cos(a) * floater.radiusX;
      const z = floater.centerZ + Math.sin(a) * floater.radiusZ;
      floater.root.position.set(x, getWaveHeight(waves, x, z, time) + floater.yOffset, z);
      floater.root.rotation.set(
        Math.sin(time * 0.7 + floater.phase) * 0.035,
        Math.atan2(
          -Math.sin(a) * floater.radiusX * Math.sign(floater.speed),
          Math.cos(a) * floater.radiusZ * Math.sign(floater.speed),
        ),
        Math.sin(time * 0.9 + floater.phase) * 0.045,
      );
    }

    for (const rotor of this.rotors) rotor.root.rotation.y = time * rotor.speed + rotor.phase;
    for (const gondola of this.gondolas) {
      const u = (Math.sin(time * gondola.speed + gondola.phase) + 1) * 0.5;
      gondola.root.position.copy(gondola.curve.getPoint(u));
      gondola.root.position.y -= 2.8;
    }
    for (const material of this.waterfallMaterials) material.uniforms.uTime.value = time;
  }

  private applyVisibility(): void {
    const detailed = this.detailScale >= 0.7;
    const extra = this.detailScale >= 0.95;
    const calm = this.weather !== "torm";
    this.detailGroup.visible = detailed;
    this.extraGroup.visible = extra;
    this.calmGroup.visible = detailed && calm;
    this.calmExtraGroup.visible = extra && calm;
    this.sunnyGroup.visible = detailed && this.weather === "paike";
    this.sunnyExtraGroup.visible = extra && this.weather === "paike";
  }

  private addBirdFlock(
    kind: "kajakas" | "kotkas",
    centerX: number,
    centerZ: number,
    radiusX: number,
    radiusZ: number,
    altitude: number,
    count: number,
    parent: THREE.Group,
  ): void {
    const root = new THREE.Group();
    const wings: WingPair[] = [];
    for (let i = 0; i < count; i++) {
      const bird = buildBird(kind);
      const row = Math.ceil(i / 2);
      const side = i === 0 ? 0 : i % 2 ? -1 : 1;
      bird.root.position.set(side * row * 3.2, (this.rnd() - 0.5) * 2.2, -row * 3.7);
      bird.root.scale.setScalar(0.85 + this.rnd() * 0.3);
      bird.wings.phase = this.rnd() * Math.PI * 2;
      wings.push(bird.wings);
      root.add(bird.root);
    }
    parent.add(root);
    this.flocks.push({
      root,
      centerX,
      centerZ,
      radiusX,
      radiusZ,
      altitude,
      speed: (kind === "kajakas" ? 0.07 : 0.045) * (this.rnd() < 0.5 ? -1 : 1),
      phase: this.rnd() * Math.PI * 2,
      wings,
    });
  }

  private addBalloon(
    centerX: number,
    centerZ: number,
    radiusX: number,
    radiusZ: number,
    altitude: number,
    colors: [number, number],
    parent: THREE.Group,
  ): void {
    const root = buildBalloon(colors);
    parent.add(root);
    this.balloons.push({
      root,
      centerX,
      centerZ,
      radiusX,
      radiusZ,
      altitude,
      speed: 0.012 + this.rnd() * 0.006,
      phase: this.rnd() * Math.PI * 2,
      bob: 3 + this.rnd() * 2,
    });
  }

  private addFloater(
    root: THREE.Group,
    centerX: number,
    centerZ: number,
    radiusX: number,
    radiusZ: number,
    speed: number,
    parent: THREE.Group,
    yOffset = 0.35,
  ): void {
    parent.add(root);
    this.floaters.push({
      root,
      centerX,
      centerZ,
      radiusX,
      radiusZ,
      speed,
      phase: this.rnd() * Math.PI * 2,
      yOffset,
    });
  }

  private buildHarborRadar(terrain: Terrain, x: number, z: number): void {
    const root = new THREE.Group();
    root.position.set(x, Math.max(0, terrain.getHeight(x, z)), z);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 15, 8), cableMat);
    mast.position.y = 7.5;
    root.add(mast);
    for (const y of [4, 8, 12]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 5, 16), cableMat);
      ring.position.y = y;
      ring.rotation.x = Math.PI / 2;
      root.add(ring);
    }
    const rotor = new THREE.Group();
    rotor.position.y = 15.5;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(10, 1.7, 0.3), teal);
    bar.position.y = 0.8;
    rotor.add(bar);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.5, 8), orange);
    hub.position.y = 0.3;
    rotor.add(hub);
    root.add(rotor);
    this.rotors.push({ root: rotor, speed: 0.48, phase: this.rnd() * Math.PI * 2 });
    this.group.add(root);
  }

  private buildWaterfall(terrain: Terrain, x: number, z: number): void {
    const top = Math.max(18, terrain.getHeight(x, z) + 3);
    const height = top - 0.8;
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: [
        "varying vec2 vUv;",
        "void main() {",
        "  vUv = uv;",
        "  vec3 p = position;",
        "  p.x += sin(uv.y * 18.0 + uv.x * 5.0) * 0.12;",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);",
        "}",
      ].join("\n"),
      fragmentShader: [
        "uniform float uTime;",
        "varying vec2 vUv;",
        "void main() {",
        "  float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(0.0, 0.16, 1.0 - vUv.x);",
        "  float streak = 0.55 + 0.45 * sin(vUv.x * 52.0 + vUv.y * 15.0 - uTime * 7.0);",
        "  float foam = smoothstep(0.72, 1.0, 1.0 - vUv.y);",
        "  vec3 color = mix(vec3(0.24, 0.63, 0.72), vec3(0.88, 0.98, 1.0), streak * 0.45 + foam);",
        "  gl_FragColor = vec4(color, edge * (0.52 + foam * 0.35));",
        "}",
      ].join("\n"),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.waterfallMaterials.push(material);
    for (const offset of [-0.06, 0.06]) {
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(7.5, height, 1, 8), material);
      fall.position.set(x, height / 2 + 0.8, z);
      fall.rotation.y = Math.atan2(x, z) + offset;
      this.group.add(fall);
    }
    const pool = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 6.5, 28),
      new THREE.MeshBasicMaterial({
        color: 0xb9f7ff,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    pool.position.set(x, 0.35, z);
    pool.rotation.x = -Math.PI / 2;
    this.group.add(pool);
  }

  private buildCableCar(terrain: Terrain): void {
    const ax = -175, az = 22, bx = 175, bz = -48;
    const aBase = Math.max(0, terrain.getHeight(ax, az));
    const bBase = Math.max(0, terrain.getHeight(bx, bz));
    const a = new THREE.Vector3(ax, aBase + 22, az);
    const b = new THREE.Vector3(bx, bBase + 22, bz);
    const mid = a.clone().lerp(b, 0.5);
    mid.y = Math.min(a.y, b.y) - 9;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.11, 5, false), cableMat);
    this.group.add(cable);

    for (const [point, base] of [[a, aBase], [b, bBase]] as const) {
      const tower = new THREE.Group();
      tower.position.set(point.x, base, point.z);
      const height = point.y - base;
      for (const x of [-1.7, 1.7]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, height, 0.45), cableMat);
        post.position.set(x, height / 2, 0);
        tower.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.55, 1), orange);
      beam.position.y = height;
      tower.add(beam);
      this.group.add(tower);
    }

    for (const phase of [0, Math.PI]) {
      const car = new THREE.Group();
      const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 5), cableMat);
      hanger.position.y = -1.5;
      car.add(hanger);
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.1, 3.4), teal);
      body.position.y = -4.3;
      car.add(body);
      const windows = new THREE.Mesh(new THREE.BoxGeometry(4.7, 1.3, 2.4), glass);
      windows.position.y = -4;
      car.add(windows);
      this.group.add(car);
      this.gondolas.push({ root: car, curve, speed: 0.12, phase });
    }
  }
}
