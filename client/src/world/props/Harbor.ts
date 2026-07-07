import * as THREE from "three";
import { mulberry32 } from "@shared/math";
import type { PropDef } from "@shared/tracks";
import type { ColliderSet } from "../../sim/Collisions";

const wood = new THREE.MeshStandardMaterial({ color: 0x7a5c3b, roughness: 0.9 });
const woodDark = new THREE.MeshStandardMaterial({ color: 0x5b452e, roughness: 0.95 });
const concrete = new THREE.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.9 });
const stone = new THREE.MeshStandardMaterial({ color: 0x75726a, roughness: 1 });
const whitePaint = new THREE.MeshStandardMaterial({ color: 0xf0ede6, roughness: 0.5 });
const redPaint = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.55 });
const steel = new THREE.MeshStandardMaterial({ color: 0x4c5359, roughness: 0.5, metalness: 0.6 });
const rust = new THREE.MeshStandardMaterial({ color: 0x8c4a32, roughness: 0.8, metalness: 0.3 });

/** Puitkai vaiadel — pikkus piki lokaalset +Z */
function buildKai(scale: number, colliders: ColliderSet, world: THREE.Matrix4): THREE.Group {
  const g = new THREE.Group();
  const L = 22 * scale, W = 4.2 * scale;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 0.35, L), wood);
  deck.position.y = 1.1;
  deck.castShadow = true;
  g.add(deck);
  for (let i = 0; i <= 5; i++) {
    for (const s of [-1, 1]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 2.6, 7), woodDark);
      pile.position.set((s * W) / 2.3, -0.1, -L / 2 + (i / 5) * L);
      g.add(pile);
    }
  }
  // Kollisioon: üks lõik piki kaid
  const a = new THREE.Vector3(0, 0, -L / 2).applyMatrix4(world);
  const b = new THREE.Vector3(0, 0, L / 2).applyMatrix4(world);
  colliders.segments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r: W / 2 + 0.3 });
  return g;
}

/** Kivimuul — madal lohisev kivivall piki +Z */
function buildMuul(scale: number, colliders: ColliderSet, world: THREE.Matrix4, seed: number): THREE.Group {
  const g = new THREE.Group();
  const L = 60 * scale;
  const rnd = mulberry32(seed);
  const geo = new THREE.DodecahedronGeometry(1.6, 0);
  const n = Math.round(L / 2.1);
  const mesh = new THREE.InstancedMesh(geo, stone, n * 2);
  const dummy = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < n; i++) {
    const z = -L / 2 + (i / (n - 1)) * L;
    for (const off of [-0.9, 0.9]) {
      dummy.position.set(off + (rnd() - 0.5) * 0.8, 0.5 + rnd() * 0.5, z + (rnd() - 0.5) * 1.2);
      dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      dummy.scale.setScalar(0.8 + rnd() * 0.7);
      dummy.updateMatrix();
      mesh.setMatrixAt(k++, dummy.matrix);
    }
  }
  mesh.castShadow = true;
  g.add(mesh);
  const a = new THREE.Vector3(0, 0, -L / 2).applyMatrix4(world);
  const b = new THREE.Vector3(0, 0, L / 2).applyMatrix4(world);
  colliders.segments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r: 2.6 * scale });
  return g;
}

/** Punase-valge triibuline tuletorn */
function buildTuletorn(scale: number, colliders: ColliderSet, world: THREE.Matrix4): THREE.Group {
  const g = new THREE.Group();
  const H = 16 * scale;
  const bands = 4;
  for (let i = 0; i < bands; i++) {
    const r0 = 2.2 - (i / bands) * 0.9;
    const r1 = 2.2 - ((i + 1) / bands) * 0.9;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(r1 * scale, r0 * scale, (H / bands), 12),
      i % 2 ? whitePaint : redPaint,
    );
    seg.position.y = (i + 0.5) * (H / bands);
    seg.castShadow = true;
    g.add(seg);
  }
  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0 * scale, 1.0 * scale, 1.6 * scale, 10),
    steel,
  );
  lantern.position.y = H + 0.8 * scale;
  g.add(lantern);
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.55 * scale, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffd75e, emissiveIntensity: 2 }),
  );
  light.position.y = H + 0.8 * scale;
  light.name = "tuletorn-light";
  g.add(light);
  const p = new THREE.Vector3().applyMatrix4(world);
  colliders.circles.push({ x: p.x, z: p.z, r: 2.4 * scale });
  return g;
}

/** Väike meremärk (päevamärk postil) */
function buildMajakas(scale: number, colliders: ColliderSet, world: THREE.Matrix4): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 4.4, 7), woodDark);
  pole.position.y = 2.2;
  g.add(pole);
  const mark = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.4, 4), redPaint);
  mark.position.y = 4.6;
  mark.castShadow = true;
  g.add(mark);
  const p = new THREE.Vector3().applyMatrix4(world);
  colliders.circles.push({ x: p.x, z: p.z, r: 0.6 * scale });
  return g;
}

/** Portaalkraana (sadamalinn) */
function buildKraana(scale: number, colliders: ColliderSet, world: THREE.Matrix4): THREE.Group {
  const g = new THREE.Group();
  const H = 18 * scale, W = 9 * scale;
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, H, 0.9), steel);
    leg.position.set((s * W) / 2, H / 2, 0);
    leg.castShadow = true;
    g.add(leg);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 4, 1.4, 1.4), rust);
  beam.position.y = H;
  beam.castShadow = true;
  g.add(beam);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 14 * scale), rust);
  jib.position.set(0, H + 1.1, 5 * scale);
  jib.castShadow = true;
  g.add(jib);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 2.4), whitePaint);
  cab.position.set(0, H - 2, 0.8);
  g.add(cab);
  // Trossid + konks
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.7), steel);
  hook.position.set(0, H - 6, 9 * scale);
  g.add(hook);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6.6, 4), steel);
  cable.position.set(0, H - 2.8, 9 * scale);
  g.add(cable);
  for (const s of [-1, 1]) {
    const p = new THREE.Vector3((s * W) / 2, 0, 0).applyMatrix4(world);
    colliders.circles.push({ x: p.x, z: p.z, r: 1.2 });
  }
  return g;
}

/** Konteinerivirn (2–3 kihti) */
function buildKonteinerivirn(scale: number, colliders: ColliderSet, world: THREE.Matrix4, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry32(seed);
  const colors = [0xb03a2e, 0x1f618d, 0x239b56, 0xca6f1e, 0x7d3c98, 0x616a6b];
  const CL = 6.1 * scale, CW = 2.45 * scale, CH = 2.6 * scale;
  const rows = 2, cols = 3, layers = 2 + Math.floor(rnd() * 2);
  for (let l = 0; l < layers; l++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (l > 0 && rnd() < 0.35) continue;
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(CW, CH, CL),
          new THREE.MeshStandardMaterial({
            color: colors[Math.floor(rnd() * colors.length)],
            roughness: 0.75,
            metalness: 0.15,
          }),
        );
        box.position.set(
          (r - (rows - 1) / 2) * (CW + 0.15),
          CH / 2 + l * CH,
          (c - (cols - 1) / 2) * (CL + 0.3),
        );
        box.castShadow = true;
        g.add(box);
      }
    }
  }
  const p = new THREE.Vector3().applyMatrix4(world);
  colliders.circles.push({ x: p.x, z: p.z, r: Math.max(CL, CW * rows) * 0.75 });
  return g;
}

/** Kaubalaev kai ääres */
function buildKaubalaev(scale: number, colliders: ColliderSet, world: THREE.Matrix4): THREE.Group {
  const g = new THREE.Group();
  const L = 58 * scale, W = 9.5 * scale;
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x25313d, roughness: 0.6, metalness: 0.3 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(W, 5, L), hullMat);
  hull.position.y = 1.2;
  hull.castShadow = true;
  g.add(hull);
  // Vöör: kiilutaoline ots
  const bow = new THREE.Mesh(new THREE.ConeGeometry(W / 2, 8, 4), hullMat);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.scale.set(1, 1, 0.7);
  bow.position.set(0, 1.2, L / 2 + 3.4);
  g.add(bow);
  const deckhouse = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 6, 6), whitePaint);
  deckhouse.position.set(0, 6.5, -L / 2 + 4.5);
  deckhouse.castShadow = true;
  g.add(deckhouse);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 3, 8), redPaint);
  funnel.position.set(0, 10.7, -L / 2 + 4.5);
  g.add(funnel);
  // Konteinerid tekil
  const colors = [0xb03a2e, 0x1f618d, 0x239b56, 0xca6f1e];
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.75, 2.4, 5.6),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.75 }),
    );
    c.position.set(0, 4.9, -L / 2 + 14 + i * 7.2);
    c.castShadow = true;
    g.add(c);
  }
  const a = new THREE.Vector3(0, 0, -L / 2 - 2).applyMatrix4(world);
  const b = new THREE.Vector3(0, 0, L / 2 + 5).applyMatrix4(world);
  colliders.segments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r: W / 2 + 0.6 });
  return g;
}

/** Laohoone */
function buildLadu(scale: number, colliders: ColliderSet, world: THREE.Matrix4): THREE.Group {
  const g = new THREE.Group();
  const W = 16 * scale, H = 7 * scale, L = 26 * scale;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8d9499, roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5d666c, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), wallMat);
  body.position.y = H / 2;
  body.castShadow = true;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2, L, 3, 1), roofMat);
  roof.rotation.z = Math.PI / 2;
  roof.rotation.x = Math.PI / 2;
  roof.scale.set(1, 1, 0.4);
  roof.position.y = H;
  g.add(roof);
  // Uksed
  for (let i = 0; i < 3; i++) {
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 4.2 * scale, 4.4 * scale),
      new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.6 }),
    );
    door.position.set(W / 2 + 0.05, 2.1 * scale, -L / 3 + i * (L / 3));
    g.add(door);
  }
  const p = new THREE.Vector3().applyMatrix4(world);
  colliders.circles.push({ x: p.x, z: p.z, r: Math.max(W, L) / 2 });
  return g;
}

/** Ehita üks prop; lisab kollisioonid colliders-hulka */
export function buildProp(def: PropDef, colliders: ColliderSet, seed: number): THREE.Group {
  const scale = def.scale ?? 1;
  const rot = def.rot ?? 0;
  const world = new THREE.Matrix4()
    .makeRotationY(rot)
    .setPosition(def.x, 0, def.z);

  let g: THREE.Group;
  switch (def.kind) {
    case "kai": g = buildKai(scale, colliders, world); break;
    case "muul": g = buildMuul(scale, colliders, world, seed); break;
    case "tuletorn": g = buildTuletorn(scale, colliders, world); break;
    case "majakas": g = buildMajakas(scale, colliders, world); break;
    case "kraana": g = buildKraana(scale, colliders, world); break;
    case "konteinerivirn": g = buildKonteinerivirn(scale, colliders, world, seed); break;
    case "kaubalaev": g = buildKaubalaev(scale, colliders, world); break;
    case "ladu": g = buildLadu(scale, colliders, world); break;
  }
  g.position.set(def.x, 0, def.z);
  g.rotation.y = rot;
  return g;
}
