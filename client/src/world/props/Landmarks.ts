import * as THREE from "three";
import type { TrackId } from "@shared/types";
import { mulberry32 } from "@shared/math";
import { getWaveHeight, type WaveSet } from "@shared/waves";
import type { Terrain } from "../Terrain";

interface IceFloater {
  root: THREE.Group;
  x: number;
  z: number;
  phase: number;
  baseRotation: number;
}

const timber = new THREE.MeshStandardMaterial({ color: 0x654832, roughness: 0.92 });
const darkTimber = new THREE.MeshStandardMaterial({ color: 0x392c24, roughness: 0.96 });
const roof = new THREE.MeshStandardMaterial({ color: 0x392f2a, roughness: 0.9 });
const redRoof = new THREE.MeshStandardMaterial({ color: 0x8f2e28, roughness: 0.86 });
const glass = new THREE.MeshStandardMaterial({
  color: 0xffd978,
  emissive: 0xffa52e,
  emissiveIntensity: 0.48,
  roughness: 0.35,
});
const rope = new THREE.MeshStandardMaterial({ color: 0x332c26, roughness: 0.88 });
const bridgeSteel = new THREE.MeshStandardMaterial({
  color: 0x4b5358,
  roughness: 0.52,
  metalness: 0.55,
});
const foam = new THREE.MeshBasicMaterial({
  color: 0xe7fbff,
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const iceTop = new THREE.MeshStandardMaterial({ color: 0xeaf6f7, roughness: 0.72 });
const iceEdge = new THREE.MeshStandardMaterial({ color: 0x91c9d5, roughness: 0.78 });

function shadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });
}

function makeCabin(wallColor: number, scale = 1): THREE.Group {
  const root = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.82 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(7, 4.8, 6), wall);
  body.position.y = 2.4;
  root.add(body);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(5.1, 3.1, 4), redRoof);
  cap.position.y = 6.35;
  cap.rotation.y = Math.PI / 4;
  root.add(cap);

  const door = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.8, 0.18), darkTimber);
  door.position.set(0, 1.5, 3.08);
  root.add(door);
  for (const x of [-2.1, 2.1]) {
    const window = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.35, 0.2), glass);
    window.position.set(x, 2.8, 3.1);
    root.add(window);
  }
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.3, 0.65), roof);
  chimney.position.set(1.8, 7.25, 0.6);
  root.add(chimney);
  root.scale.setScalar(scale);
  shadows(root);
  return root;
}

function makeChapel(): THREE.Group {
  const root = makeCabin(0xe6dfcf, 1.12);
  const wall = new THREE.MeshStandardMaterial({ color: 0xe8e3d8, roughness: 0.84 });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 6.5, 2.2), wall);
  tower.position.set(0, 6, 1.8);
  root.add(tower);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2, 4.8, 4), roof);
  spire.position.set(0, 11.5, 1.8);
  spire.rotation.y = Math.PI / 4;
  root.add(spire);
  shadows(root);
  return root;
}

function makeShipwreck(): THREE.Group {
  const root = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.2, 19), darkTimber);
  hull.position.y = -0.25;
  hull.rotation.z = -0.12;
  root.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(2.75, 5.2, 4), darkTimber);
  bow.position.set(0, -0.25, 11.6);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  root.add(bow);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 12, 7), timber);
  mast.position.set(0.7, 4.1, -1.5);
  mast.rotation.z = 0.28;
  root.add(mast);
  const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 7, 6), timber);
  spar.position.set(0.3, 7.3, -1.5);
  spar.rotation.z = Math.PI / 2 + 0.25;
  root.add(spar);
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 7, 0, 0, 1.4, 0, -3.5, 2.2, 0], 3),
  );
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(
    sailGeo,
    new THREE.MeshStandardMaterial({
      color: 0xb7aa92,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  sail.position.set(0.3, 0.3, -1.4);
  sail.rotation.y = 0.18;
  root.add(sail);
  shadows(root);
  return root;
}

function makePier(): THREE.Group {
  const root = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.35, 28), timber);
  deck.position.y = 1.05;
  root.add(deck);
  for (const z of [-12, -6, 0, 6, 12]) {
    for (const x of [-1.7, 1.7]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.19, 3.2, 6),
        darkTimber,
      );
      post.position.set(x, -0.25, z);
      root.add(post);
    }
  }
  shadows(root);
  return root;
}

function makeRapids(width: number, length: number): THREE.Group {
  const root = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-1, 0);
  shape.lineTo(-0.12, 0.62);
  shape.lineTo(0, 0.86);
  shape.lineTo(0.12, 0.62);
  shape.lineTo(1, 0);
  shape.lineTo(1, -0.15);
  shape.lineTo(0, 0.54);
  shape.lineTo(-1, -0.15);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 7; i++) {
    const crest = new THREE.Mesh(geo, foam);
    crest.position.set(
      (i % 2 ? 1 : -1) * width * 0.08,
      0,
      -length / 2 + (i / 6) * length,
    );
    crest.scale.set(width * (0.36 + (i % 3) * 0.05), width * 0.36, 1);
    root.add(crest);
  }
  return root;
}

function makeSuspensionBridge(): THREE.Group {
  const root = new THREE.Group();
  const span = 88;
  const deckY = 14;
  const towerX = 40;
  const towerTop = 28;

  const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 0.65, 5.4), timber);
  deck.position.y = deckY;
  root.add(deck);
  for (let i = -10; i <= 10; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.22, 5.8), darkTimber);
    plank.position.set(i * 4, deckY + 0.42, 0);
    root.add(plank);
  }

  for (const x of [-towerX, towerX]) {
    for (const z of [-3.2, 3.2]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, towerTop, 0.85),
        bridgeSteel,
      );
      post.position.set(x, towerTop / 2, z);
      root.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.75, 8.2), bridgeSteel);
    beam.position.set(x, towerTop, 0);
    root.add(beam);
  }

  for (const z of [-3.5, 3.5]) {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-span / 2, towerTop - 1, z),
      new THREE.Vector3(0, deckY + 4, z),
      new THREE.Vector3(span / 2, towerTop - 1, z),
    );
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 42, 0.11, 5, false), rope));
    for (let i = -9; i <= 9; i++) {
      const x = i * 4.4;
      const u = (x + span / 2) / span;
      const cableY = curve.getPoint(THREE.MathUtils.clamp(u, 0, 1)).y;
      const h = Math.max(0.6, cableY - deckY);
      const hanger = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, h, 4),
        rope,
      );
      hanger.position.set(x, deckY + h / 2, z);
      root.add(hanger);
    }
  }
  shadows(root);
  return root;
}

function makeSpectatorCamp(seed: number): THREE.Group {
  const root = new THREE.Group();
  const rnd = mulberry32(seed);
  const tentColors = [0xe45c36, 0x2a8794, 0xf0b541];
  for (let i = 0; i < 3; i++) {
    const tent = new THREE.Mesh(
      new THREE.ConeGeometry(2.8, 2.6, 4),
      new THREE.MeshStandardMaterial({ color: tentColors[i], roughness: 0.85 }),
    );
    tent.position.set(-8 + i * 6.5, 1.3, 7 + (i % 2) * 2);
    tent.rotation.y = Math.PI / 4;
    root.add(tent);
  }
  for (let row = 0; row < 3; row++) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 1.2), timber);
    bench.position.set(2, 0.8 + row * 0.75, -2 - row * 1.65);
    root.add(bench);
  }

  const bodies = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.28, 0.34, 1.25, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
    14,
  );
  const heads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.28, 6, 5),
    new THREE.MeshStandardMaterial({ color: 0xe2b58e, roughness: 0.86 }),
    14,
  );
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < 14; i++) {
    const row = i % 3;
    const x = -5.5 + (i % 7) * 2.15 + (rnd() - 0.5) * 0.3;
    const z = -1.7 - row * 1.65;
    const y = 1.85 + row * 0.75;
    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, color.setHSL(rnd(), 0.62, 0.52));
    dummy.position.y = y + 0.85;
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  }
  bodies.castShadow = true;
  heads.castShadow = true;
  root.add(bodies, heads);
  shadows(root);
  return root;
}

/** Rajapõhised suured maamärgid ja kvaliteeditasemega piiratud detailiklastrid. */
export class TrackLandmarks {
  readonly group = new THREE.Group();

  private readonly signatureGroup = new THREE.Group();
  private readonly detailGroup = new THREE.Group();
  private readonly extraGroup = new THREE.Group();
  private readonly iceFloaters: IceFloater[] = [];
  private readonly rnd: () => number;

  constructor(trackId: TrackId, seed: number, terrain: Terrain) {
    this.rnd = mulberry32(seed + 15031);
    this.group.name = "rajamaamargid";
    this.group.add(this.signatureGroup, this.detailGroup, this.extraGroup);

    switch (trackId) {
      case "saarestik":
        this.buildFishingVillage(terrain);
        this.placeWater(makeShipwreck(), 310, -205, -0.72, this.signatureGroup, -0.4);
        this.placeCamp(terrain, 265, 270, -2.3, seed + 1);
        break;
      case "sadamalinn":
        this.placeCamp(terrain, 250, -335, Math.PI, seed + 2);
        break;
      case "joekanjon":
        this.placeWater(makeSuspensionBridge(), 340, 48, 0, this.signatureGroup);
        this.placeRapids(260, -142, 1.05, 18, 32);
        this.placeRapids(330, 82, -0.68, 16, 28);
        this.placeRapids(-205, 162, -1.82, 17, 30);
        this.placeCamp(terrain, 410, 210, -2.5, seed + 3);
        break;
      case "fjord":
        this.buildMountainVillage(terrain);
        this.buildIceField();
        this.placeCamp(terrain, -420, 285, -1.1, seed + 4);
        break;
    }
    this.setDetailScale(1);
  }

  setDetailScale(scale: number): void {
    this.signatureGroup.visible = scale >= 0.4;
    this.detailGroup.visible = scale >= 0.7;
    this.extraGroup.visible = scale >= 0.95;
  }

  update(waves: WaveSet, time: number): void {
    for (const floater of this.iceFloaters) {
      const y = getWaveHeight(waves, floater.x, floater.z, time);
      floater.root.position.y = y + 0.08;
      floater.root.rotation.x = Math.sin(time * 0.55 + floater.phase) * 0.035;
      floater.root.rotation.z = Math.sin(time * 0.43 + floater.phase * 1.7) * 0.045;
      floater.root.rotation.y = floater.baseRotation + time * 0.018;
    }
  }

  private buildFishingVillage(terrain: Terrain): void {
    const houses = [
      [84, -148, 0.15, 0xb64032],
      [96, -145, -0.2, 0xd7a33c],
      [88, -132, 2.9, 0x2d7f88],
      [105, -132, 3.15, 0xd9d1bd],
    ] as const;
    for (const [x, z, rot, color] of houses) {
      const cabin = makeCabin(color, 0.78);
      cabin.position.set(x, Math.max(0, terrain.getHeight(x, z)), z);
      cabin.rotation.y = rot;
      this.signatureGroup.add(cabin);
    }
    const pier = makePier();
    pier.position.set(96, 0, -111);
    this.detailGroup.add(pier);
    for (const x of [91, 96, 101]) {
      const buoy = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xe96a2d, roughness: 0.62 }),
      );
      buoy.position.set(x, 0.35, -100 - this.rnd() * 5);
      this.extraGroup.add(buoy);
    }
  }

  private buildMountainVillage(terrain: Terrain): void {
    const houses = [
      [215, 245, -0.2, 0xa93832],
      [236, 252, 0.25, 0xd2a53e],
      [255, 264, -0.35, 0x2c7290],
      [226, 275, 2.8, 0xd8d3c7],
      [264, 287, 3.15, 0xa84b32],
    ] as const;
    for (const [x, z, rot, color] of houses) {
      const cabin = makeCabin(color, 0.9);
      cabin.position.set(x, Math.max(0, terrain.getHeight(x, z)), z);
      cabin.rotation.y = rot;
      this.signatureGroup.add(cabin);
    }
    const chapel = makeChapel();
    chapel.position.set(242, Math.max(0, terrain.getHeight(242, 295)), 295);
    chapel.rotation.y = Math.PI;
    this.signatureGroup.add(chapel);
  }

  private buildIceField(): void {
    const placements = [
      [500, -8, 5.8, 0.1],
      [392, 148, 4.2, -0.35],
      [205, 121, 6.8, 0.5],
      [52, 198, 3.6, -0.1],
      [-344, 227, 5.1, 0.25],
      [-477, 93, 3.8, -0.45],
      [-475, -106, 6.2, 0.2],
    ] as const;
    placements.forEach(([x, z, radius, rot], index) => {
      const root = new THREE.Group();
      const edge = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.92, 0.55, 7),
        iceEdge,
      );
      edge.position.y = -0.14;
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.94, radius, 0.32, 7),
        iceTop,
      );
      top.position.y = 0.22;
      root.add(edge, top);
      root.position.set(x, 0, z);
      root.rotation.y = rot;
      root.scale.z = 0.65 + this.rnd() * 0.25;
      shadows(root);
      (index < 4 ? this.detailGroup : this.extraGroup).add(root);
      this.iceFloaters.push({
        root,
        x,
        z,
        phase: this.rnd() * Math.PI * 2,
        baseRotation: rot,
      });
    });
  }

  private placeCamp(terrain: Terrain, x: number, z: number, rot: number, seed: number): void {
    const camp = makeSpectatorCamp(seed);
    camp.position.set(x, Math.max(0, terrain.getHeight(x, z)), z);
    camp.rotation.y = rot;
    this.detailGroup.add(camp);
  }

  private placeRapids(
    x: number,
    z: number,
    rot: number,
    width: number,
    length: number,
  ): void {
    const rapids = makeRapids(width, length);
    rapids.position.set(x, 0.32, z);
    rapids.rotation.y = rot;
    this.detailGroup.add(rapids);
  }

  private placeWater(
    root: THREE.Group,
    x: number,
    z: number,
    rot: number,
    parent: THREE.Group,
    y = 0,
  ): void {
    root.position.set(x, y, z);
    root.rotation.y = rot;
    parent.add(root);
  }
}
