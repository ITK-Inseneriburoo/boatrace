import * as THREE from "three";

export interface RampInstance {
  /** sissesõiduserva keskpunkt veepiiril */
  x: number;
  z: number;
  /** sõidusuund (ühikvektor) */
  dirX: number;
  dirZ: number;
  width: number;
  length: number;
  height: number;
}

/** Pinnakõrgus rambi peal või -Infinity kui punkt pole rambil */
export function rampSurfaceHeight(r: RampInstance, x: number, z: number): number {
  const px = x - r.x, pz = z - r.z;
  const u = px * r.dirX + pz * r.dirZ; // piki rampi
  const v = px * -r.dirZ + pz * r.dirX; // risti
  if (u < 0 || u > r.length || Math.abs(v) > r.width / 2) return -Infinity;
  return (u / r.length) * r.height;
}

/** Ujuv hüpperamp: kaldpind + pontoonid + äärekurbid */
export function buildRampMesh(r: RampInstance): THREE.Group {
  const g = new THREE.Group();
  const slopeLen = Math.hypot(r.length, r.height);
  const angle = Math.atan2(r.height, r.length);

  const deckMat = new THREE.MeshStandardMaterial({ color: 0xc7552e, roughness: 0.6 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.5 });

  const deck = new THREE.Mesh(new THREE.BoxGeometry(r.width, 0.22, slopeLen), deckMat);
  deck.position.set(0, r.height / 2 - 0.11, r.length / 2);
  deck.rotation.x = -angle;
  deck.castShadow = true;
  g.add(deck);

  // Äärekurbid
  for (const s of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, slopeLen), sideMat);
    curb.position.set((s * r.width) / 2, r.height / 2 + 0.12, r.length / 2);
    curb.rotation.x = -angle;
    curb.castShadow = true;
    g.add(curb);
  }

  // Pontoonid tagaservas
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, r.width * 0.45, 10),
      sideMat,
    );
    p.rotation.z = Math.PI / 2;
    p.position.set((s * r.width) / 4, r.height - 0.4, r.length - 0.6);
    g.add(p);
  }

  g.position.set(r.x, 0, r.z);
  g.rotation.y = Math.atan2(r.dirX, r.dirZ);
  // NB: Kenney ramp-wide venib jalajäljele skaleerides katki — jääb protseduuriline
  return g;
}
