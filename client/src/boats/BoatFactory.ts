import * as THREE from "three";
import type { VehicleId } from "@shared/types";
import { VEHICLES } from "@shared/vehicles";
import { makeHullGeometry, makeJetskiHullGeometry } from "./boatMeshes";

/** Kere põhivärvid sõidukite kaupa */
const HULL_COLORS: Record<VehicleId, number> = {
  kiirpaat: 0xf2f3f4,
  kaater: 0x15181d,
  kalapaat: 0x28536b,
  jett: 0xf2f3f4,
  sportjett: 0x1c1f24,
};

function hullMaterial(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.25,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
  });
}

function accentMaterial(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.35,
    metalness: 0.1,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
  });
}

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x0c1a24,
  roughness: 0.05,
  metalness: 0.4,
  envMapIntensity: 1.6,
});
const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.7 });
const seatMat = new THREE.MeshStandardMaterial({ color: 0x2e3338, roughness: 0.9 });

function outboardMotor(cowl: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.5), cowl);
  head.position.y = 0.45;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.6, 8), darkMat);
  leg.position.y = 0;
  g.add(head, leg);
  return g;
}

/**
 * Ehitab sõiduki 3D-mudeli. accentColor = mängija valitud värv (triibud/detailid).
 * Kõik osad castShadow'ga; füüsika EI sõltu siinsest geomeetriast.
 */
export function buildBoatModel(id: VehicleId, accentColor: number): THREE.Group {
  const s = VEHICLES[id];
  const group = new THREE.Group();
  const accent = accentMaterial(accentColor);

  if (s.tyyp === "paat") {
    const { hull, deckY } = makeHullGeometry(s.hullLength, s.hullWidth);
    const hullMesh = new THREE.Mesh(hull, hullMaterial(HULL_COLORS[id]));
    group.add(hullMesh);


    // Kajut + tuuleklaas
    const cabinW = s.hullWidth * 0.62;
    const cabinL = s.hullLength * 0.3;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinW, 0.34, cabinL), accent);
    cabin.position.set(0, deckY + 0.19, s.hullLength * 0.08);
    group.add(cabin);

    const wsGeo = new THREE.BoxGeometry(cabinW * 0.94, 0.3, 0.06);
    const ws = new THREE.Mesh(wsGeo, glassMat);
    ws.position.set(0, deckY + 0.48, s.hullLength * 0.08 + cabinL / 2 - 0.05);
    ws.rotation.x = -0.5;
    group.add(ws);

    // Iste/pukk
    const seat = new THREE.Mesh(new THREE.BoxGeometry(cabinW * 0.8, 0.26, 0.5), seatMat);
    seat.position.set(0, deckY + 0.15, -s.hullLength * 0.12);
    group.add(seat);

    // Päramootor (kate mängija värvi)
    const motor = outboardMotor(accent);
    motor.position.set(0, 0.1, -s.hullLength / 2 - 0.12);
    group.add(motor);
  } else {
    // Jett
    const { hull, deckY } = makeJetskiHullGeometry(s.hullLength, s.hullWidth);
    const hullMesh = new THREE.Mesh(hull, hullMaterial(HULL_COLORS[id]));
    group.add(hullMesh);

    // Kere ülaosa aktsentvärvi
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(s.hullWidth * 0.66, 0.16, s.hullLength * 0.6),
      accent,
    );
    top.position.set(0, deckY + 0.05, 0);
    group.add(top);

    // Iste
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(s.hullWidth * 0.42, 0.24, s.hullLength * 0.42),
      seatMat,
    );
    seat.position.set(0, deckY + 0.22, -s.hullLength * 0.08);
    group.add(seat);

    // Juhtraud
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 8), darkMat);
    stem.position.set(0, deckY + 0.32, s.hullLength * 0.22);
    stem.rotation.x = 0.5;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 8), darkMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, deckY + 0.51, s.hullLength * 0.17);
    group.add(stem, bar);
  }

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
    }
  });
  return group;
}
