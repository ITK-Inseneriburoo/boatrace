import * as THREE from "three";
import type { TrackDef } from "@shared/tracks";
import { mulberry32 } from "@shared/math";
import type { Terrain } from "../Terrain";

/**
 * Männid saartel: tüved + võrad kahe InstancedMesh'ina.
 * Paigutus deterministlik (seed), ainult sobival kõrgusel/kaldel.
 */
export function buildVegetation(track: TrackDef, terrain: Terrain): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry32(track.seed + 99);
  const placements: { x: number; z: number; s: number; rot: number }[] = [];

  for (const isl of track.terrain.islands) {
    for (let i = 0; i < track.treesPerIsland; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * isl.r * 0.85;
      const x = isl.x + Math.cos(a) * d;
      const z = isl.z + Math.sin(a) * d;
      const h = terrain.getHeight(x, z);
      if (h < 1.6 || h > 9) continue;
      const [gx, gz] = terrain.getGradient(x, z);
      if (Math.hypot(gx, gz) > 0.55) continue; // liiga järsk
      placements.push({ x, z, s: 0.7 + rnd() * 0.7, rot: rnd() * Math.PI * 2 });
    }
  }
  if (!placements.length) return g;

  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 2.4, 6);
  trunkGeo.translate(0, 1.2, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d4c2f, roughness: 0.9 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, placements.length);

  const crown1 = new THREE.ConeGeometry(1.5, 2.6, 7);
  crown1.translate(0, 3.2, 0);
  const crown2 = new THREE.ConeGeometry(1.05, 2.0, 7);
  crown2.translate(0, 4.6, 0);
  const crownGeo = mergeCones(crown1, crown2);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2e5230, roughness: 0.9 });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, placements.length);

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  placements.forEach((p, i) => {
    const y = terrain.getHeight(p.x, p.z) - 0.15;
    dummy.position.set(p.x, y, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.setScalar(p.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    crowns.setMatrixAt(i, dummy.matrix);
    crowns.setColorAt(i, col.setHSL(0.32, 0.32, 0.22 + rnd() * 0.1));
  });
  trunks.castShadow = true;
  crowns.castShadow = true;
  g.add(trunks, crowns);
  return g;
}

function mergeCones(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  // väike käsitsi-merge, et mitte importida utils'i ainult selleks
  const geos = [a, b].map((geo) => geo.toNonIndexed());
  const total = geos.reduce((n, g0) => n + g0.getAttribute("position").count, 0);
  const pos = new Float32Array(total * 3);
  const norm = new Float32Array(total * 3);
  let off = 0;
  for (const g0 of geos) {
    pos.set(g0.getAttribute("position").array as Float32Array, off * 3);
    norm.set(g0.getAttribute("normal").array as Float32Array, off * 3);
    off += g0.getAttribute("position").count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(norm, 3));
  return out;
}
