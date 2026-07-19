import * as THREE from "three";
import { mulberry32 } from "@shared/math";
import type { PropDef } from "@shared/tracks";
import type { ColliderSet } from "../../sim/Collisions";
import { fitToSize, loadModel } from "../../core/Assets";
import { loadPbrSet, applyPbr } from "../../core/Textures";
import { shipLogoTexture, signTexture } from "../../core/Brand";
import { buildFlagPole } from "./Flags";

/** ITK osakonnad — laohoonete sildid (elektri/kütte/venti/vee projekteerimine) */
const LADU_SILDID = ["ELEKTRIPROJEKTEERIMINE", "KÜTE JA JAHUTUS", "VENTILATSIOON", "VESI JA KANAL"];
let laduCounter = 0;

const wood = new THREE.MeshStandardMaterial({ color: 0x7a5c3b, roughness: 0.9 });
const woodDark = new THREE.MeshStandardMaterial({ color: 0x5b452e, roughness: 0.95 });
const concrete = new THREE.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.9 });
const stone = new THREE.MeshStandardMaterial({ color: 0x75726a, roughness: 1 });
const whitePaint = new THREE.MeshStandardMaterial({ color: 0xf0ede6, roughness: 0.5 });
const redPaint = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.55 });
const steel = new THREE.MeshStandardMaterial({ color: 0x4c5359, roughness: 0.5, metalness: 0.6 });
const rust = new THREE.MeshStandardMaterial({ color: 0x8c4a32, roughness: 0.8, metalness: 0.3 });

// PBR-tekstuurid saabuvad asünkroonselt ja riietavad jagatud materjalid ümber —
// kõik sama materjali meshid uuenevad korraga; 404 → jääb ülaltoodud lihtvärv.
// Värv jääb tindiks (map × color), seepärast heledamaks pärast map'i lisamist.
const dress = async (
  mat: THREE.MeshStandardMaterial,
  base: string,
  repeat: number,
  tint: number,
): Promise<void> => {
  const set = await loadPbrSet(base);
  if (!set) return;
  applyPbr(mat, set, repeat);
  mat.color.set(tint);
};
void dress(wood, "/textures/harbor/planks", 2, 0xffffff);
void dress(woodDark, "/textures/harbor/planks", 2, 0x8a8078);
void dress(concrete, "/textures/harbor/concrete", 2, 0xffffff);
void dress(stone, "/textures/terrain/rock", 1, 0xdddddd);
void dress(steel, "/textures/harbor/metal", 1, 0x9aa2a8);
void dress(rust, "/textures/harbor/rust", 1, 0xffffff);

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

/** Portaalkraana (sadamalinn) — sõrestikjalad, vagonett, rippuv konteiner */
function buildKraana(scale: number, colliders: ColliderSet, world: THREE.Matrix4): THREE.Group {
  const g = new THREE.Group();
  const H = 18 * scale, W = 9 * scale;
  const warn = new THREE.MeshStandardMaterial({ color: 0xd9822b, roughness: 0.6 });

  for (const s of [-1, 1]) {
    // A-jalg: kaks posti + põiktalad
    for (const zoff of [-1.6, 1.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.65, H, 0.65), steel);
      leg.position.set((s * W) / 2, H / 2, zoff);
      leg.castShadow = true;
      g.add(leg);
    }
    for (let i = 1; i <= 3; i++) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 3.9), steel);
      cross.position.set((s * W) / 2, (H * i) / 3.4, 0);
      g.add(cross);
      const diag = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 4.4), steel);
      diag.position.set((s * W) / 2, (H * (i - 0.5)) / 3.4, 0);
      diag.rotation.x = i % 2 ? 0.7 : -0.7;
      g.add(diag);
    }
    // Alusvanker + rattad
    const bogie = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 4.6), warn);
    bogie.position.set((s * W) / 2, 0.5, 0);
    g.add(bogie);
  }

  // Peatala (kahekordne) + otste hoiatustriibud
  for (const zoff of [-0.9, 0.9]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 7, 1.5, 1.1), rust);
    beam.position.set(0, H, zoff);
    beam.castShadow = true;
    g.add(beam);
  }
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 3.0), warn);
    tip.position.set((s * (W + 7)) / 2, H, 0);
    g.add(tip);
  }

  // Vagonett tala peal + trossid + rippuv konteiner
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2.6), warn);
  trolley.position.set(W * 0.18, H + 1.2, 0);
  g.add(trolley);
  const drop = H * 0.42;
  for (const [cx, cz] of [[-0.8, -0.9], [0.8, -0.9], [-0.8, 0.9], [0.8, 0.9]] as const) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, drop, 4), steel);
    cable.position.set(W * 0.18 + cx, H - drop / 2 + 0.6, cz);
    g.add(cable);
  }
  const hangingBox = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 2.5, 5.9),
    new THREE.MeshStandardMaterial({ color: 0x1f618d, roughness: 0.75, metalness: 0.15 }),
  );
  hangingBox.position.set(W * 0.18, H - drop - 0.6, 0);
  hangingBox.castShadow = true;
  g.add(hangingBox);

  // Juhikabiin tala küljes
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.1, 2.4), whitePaint);
  cab.position.set(-W * 0.22, H - 1.8, 1.9);
  g.add(cab);
  const cabGlass = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.9, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x0c1a24, roughness: 0.1, metalness: 0.4 }),
  );
  cabGlass.position.set(-W * 0.22, H - 1.6, 3.08);
  g.add(cabGlass);

  for (const s of [-1, 1]) {
    const p = new THREE.Vector3((s * W) / 2, 0, 0).applyMatrix4(world);
    colliders.circles.push({ x: p.x, z: p.z, r: 2.6 });
  }

  // Realistlik kraana (Sketchfab, meshopt) asendab sõrestiku, kui laadub;
  // tala jookseb mõlemal piki X-telge
  void loadModel("props/harbor-crane", false).then((m) => {
    if (!m) return;
    fitToSize(m, H * 1.3, "y");
    // fitToSize joondab bbox-i põhja, aga mudeli bbox-is ripub üksikuid
    // tippe (trossiotsad) ratastest tükk maad allpool — kraana jäi õhku
    // hõljuma. Joonda rataste tegelik toetuspind maapinnale.
    m.position.y -= supportY(m);
    g.clear();
    g.add(m);
  });
  return g;
}

/**
 * Mudeli robustne toetuspind: tippude Y 0,5-protsentiil vanema ruumis.
 * Bbox-miinimum eksib, kui geomeetrias ripub üksikuid madalaid tippe.
 */
function supportY(m: THREE.Group): number {
  m.updateMatrixWorld(true);
  const ys: number[] = [];
  const v = new THREE.Vector3();
  m.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = (o.geometry as THREE.BufferGeometry).getAttribute("position");
    const step = Math.max(1, Math.floor(pos.count / 20000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      ys.push(v.y);
    }
  });
  if (!ys.length) return 0;
  ys.sort((a, b) => a - b);
  return ys[Math.floor(0.005 * (ys.length - 1))];
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

  // NB: teadlikult ilma cargo-pile-a.glb asenduseta — Kenney kuhil on
  // kotid/tünnid, mis ei loe konteineriterminalina; kastid jäävad
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
  // NB: Kenney laev on jässakam (laius ~37% pikkusest) — raadius selle järgi.
  // Kui päris mudel laadub, mõõdetakse kapsel allpool tema mõõtude järgi üle.
  const seg = { ax: a.x, az: a.z, bx: b.x, bz: b.z, r: Math.max(W / 2 + 0.6, L * 0.19) };
  colliders.segments.push(seg);

  // Realistlik kaubalaev (Sketchfab, meshopt), varuks Kenney oma + ITK logo külgedel
  void loadModel("props/cargo-ship", false)
    .then((m) => m ?? loadModel("ship-cargo-a"))
    .then((m) => {
    if (!m) return;
    // Sketchfabi laev on X-suunaline — keera piki kaid (+Z)
    const xLong = new THREE.Box3().setFromObject(m);
    if (xLong.max.x - xLong.min.x > xLong.max.z - xLong.min.z) {
      const w = new THREE.Group();
      w.rotation.y = Math.PI / 2;
      w.add(m);
      m = w;
    }
    fitToSize(m as THREE.Group, L, "z");
    // Lastis laev istub sügavamal: tume veealune põhjaosa jääb vee alla
    m.position.y -= 2.8;
    g.clear();
    g.add(m);

    // Kast otse geomeetriast laevagrupi LOKAALSES ruumis: inv·matrixWorld
    // taandab grupi pöörde täpselt välja. Maailmaruumi bbox kaudu käies
    // paisuks kast pööratud laeval kaks korda (logod hõljusid õhus).
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const localBox = (o: THREE.Object3D): THREE.Box3 => {
      const box = new THREE.Box3();
      const rel = new THREE.Matrix4();
      o.traverse((c) => {
        if (!(c instanceof THREE.Mesh)) return;
        const geo = c.geometry as THREE.BufferGeometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        rel.copy(inv).multiply(c.matrixWorld);
        box.union(geo.boundingBox!.clone().applyMatrix4(rel));
      });
      return box;
    };
    // Kere = suurima põhjapindalaga mesh (kraanad/mastid on kerest laiemad)
    const fullBox = localBox(m);
    let hullBox = fullBox;
    let bestArea = 0;
    m.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const bx = localBox(o);
        const area = (bx.max.x - bx.min.x) * (bx.max.z - bx.min.z);
        if (area > bestArea) {
          bestArea = area;
          hullBox = bx;
        }
      }
    });

    // Kollisioonikapsel päris kere järgi: Kenney-varu jaoks pandud lai
    // raadius (L*0.19) põrgatas saleda Sketchfabi laeva juures liiga vara
    const r = (hullBox.max.x - hullBox.min.x) / 2 + 0.5;
    const zMid = (fullBox.min.z + fullBox.max.z) / 2;
    const za = Math.min(fullBox.min.z + r, zMid);
    const zb = Math.max(fullBox.max.z - r, zMid);
    const wa = new THREE.Vector3(0, 0, za).applyMatrix4(g.matrixWorld);
    const wb = new THREE.Vector3(0, 0, zb).applyMatrix4(g.matrixWorld);
    seg.ax = wa.x;
    seg.az = wa.z;
    seg.bx = wb.x;
    seg.bz = wb.z;
    seg.r = r;

    void shipLogoTexture().then((tex) => {
      if (!tex) return;
      const box = hullBox;
      const halfW = (box.max.x - box.min.x) / 2;
      const logoY = box.min.y + (box.max.y - box.min.y) * 0.62;
      // Keskkere kohal (kere kõige laiem koht) — nihkega paneel ulatuks
      // kitseneva ahtri/vööri juures kerest välja ja paistaks hõljuvana
      for (const s of [-1, 1]) {
        const logo = new THREE.Mesh(
          new THREE.PlaneGeometry(L * 0.072, L * 0.036),
          // Kergelt läbipaistev, et kere ilmastikutekstuur kumaks läbi
          new THREE.MeshStandardMaterial({
            map: tex,
            transparent: true,
            opacity: 0.8,
            roughness: 0.6,
          }),
        );
        logo.position.set(s * (halfW + 0.06), logoY, (box.min.z + box.max.z) / 2);
        logo.rotation.y = (s * Math.PI) / 2;
        g.add(logo);
      }
    });
  });
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
  // ITK osakonnasilt pika külje peal
  const silt = LADU_SILDID[laduCounter++ % LADU_SILDID.length];
  void signTexture(silt).then((tex) => {
    if (!tex) return;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(10 * scale, 2.5 * scale),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }),
    );
    sign.position.set(W / 2 + 0.15, H * 0.72, 0);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
  });
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
    case "lipp": g = buildFlagPole(7 * scale); break;
  }
  g.position.set(def.x, 0, def.z);
  g.rotation.y = rot;
  return g;
}
