import * as THREE from "three";

/**
 * Protseduurilised paadikered: ristlõikeprofiil loftitakse piki kiilu.
 * Paadi "edasi" on +Z, vöör asub +Z otsas. Y=0 on ligikaudne veepiir.
 */

interface Section {
  z: number;
  /** poolristlõike punktid paremalt poolt: [x, y] deki äärest kiiluni */
  pts: [number, number][];
}

/** Ehita sümmeetriline kere sektsioonidest (peegeldab x-telje suhtes) */
function loft(sections: Section[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const P = sections[0].pts.length;
  const pt = (si: number, pi: number, mirror: boolean): THREE.Vector3 => {
    const s = sections[si];
    const [x, y] = s.pts[pi];
    return new THREE.Vector3(mirror ? -x : x, y, s.z);
  };

  for (let si = 0; si < sections.length - 1; si++) {
    for (let pi = 0; pi < P - 1; pi++) {
      for (const m of [false, true]) {
        const a = pt(si, pi, m), b = pt(si, pi + 1, m);
        const c = pt(si + 1, pi, m), d = pt(si + 1, pi + 1, m);
        if (m) {
          push(a, b, c);
          push(b, d, c);
        } else {
          push(a, c, b);
          push(b, c, d);
        }
      }
    }
  }

  // Ahtripeegel (transom) — lame tagasein, normaal väljapoole (-Z)
  const st = sections[0];
  for (let pi = 0; pi < P - 1; pi++) {
    const a = new THREE.Vector3(st.pts[pi][0], st.pts[pi][1], st.z);
    const b = new THREE.Vector3(st.pts[pi + 1][0], st.pts[pi + 1][1], st.z);
    const am = new THREE.Vector3(-a.x, a.y, a.z);
    const bm = new THREE.Vector3(-b.x, b.y, b.z);
    push(a, b, am);
    push(b, bm, am);
  }

  // Tekk — ühenda deki ääred (punkt 0) üle keskjoone, normaal üles
  for (let si = 0; si < sections.length - 1; si++) {
    const a = pt(si, 0, false), b = pt(si, 0, true);
    const c = pt(si + 1, 0, false), d = pt(si + 1, 0, true);
    push(a, b, c);
    push(b, d, c);
  }

  let geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo = mergeVerts(geo);
  geo.computeVertexNormals();
  return geo;
}

/** Liida lähestikused tipud, et normaalid tuleksid siledad */
function mergeVerts(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute("position");
  const map = new Map<string, number>();
  const idx: number[] = [];
  const out: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${Math.round(x * 500)},${Math.round(y * 500)},${Math.round(z * 500)}`;
    let j = map.get(key);
    if (j === undefined) {
      j = out.length / 3;
      map.set(key, j);
      out.push(x, y, z);
    }
    idx.push(j);
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  merged.setIndex(idx);
  return merged;
}

/** V-põhjaga kere poolristlõige */
function hullSection(
  z: number,
  width: number,
  depth: number,
  deckY: number,
  flare = 1.04,
): Section {
  const w = width / 2;
  return {
    z,
    pts: [
      [w * flare, deckY], // deki äär (kergelt väljapoole)
      [w, deckY * 0.25],
      [w * 0.82, -depth * 0.42], // kimm (chine)
      [w * 0.35, -depth * 0.85],
      [0, -depth], // kiil
    ],
  };
}

export interface BoatMeshParts {
  hull: THREE.BufferGeometry;
  /** kajuti/istme jm detailide paigutuseks */
  deckY: number;
}

/** Kiirpaadi/kaatri tüüpi kere */
export function makeHullGeometry(length: number, width: number, deckY = 0.42, depth = 0.55): BoatMeshParts {
  const L = length;
  const sections: Section[] = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 = ahter, 1 = vöör
    const z = -L / 2 + t * L;
    // Laius: ahtris täis, vööris kokku
    const wProfile = t < 0.55 ? 1 : Math.cos(((t - 0.55) / 0.45) * Math.PI * 0.5);
    const w = Math.max(width * wProfile, 0.045);
    // Kiil tõuseb vööris (rocker)
    const d = depth * (t < 0.6 ? 1 : 1 - ((t - 0.6) / 0.4) * 0.75);
    // Tekk tõuseb vööri poole (sheer) — tagasihoidlikult, muidu tekib "sarv"
    const dy = deckY * (1 + t * t * 0.22);
    sections.push(hullSection(z, w, d, dy));
  }
  return { hull: loft(sections), deckY };
}

/** Jeti kere — lühem, ümaram, madalam */
export function makeJetskiHullGeometry(length: number, width: number): BoatMeshParts {
  const L = length;
  const deckY = 0.3;
  const sections: Section[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = -L / 2 + t * L;
    const wProfile = Math.sin(Math.PI * (0.12 + t * 0.82));
    const w = Math.max(width * wProfile, 0.04);
    const d = 0.32 * (t < 0.55 ? 1 : 1 - ((t - 0.55) / 0.45) * 0.6);
    sections.push(hullSection(z, w, d, deckY * (1 + t * 0.35), 1.05));
  }
  return { hull: loft(sections), deckY };
}
