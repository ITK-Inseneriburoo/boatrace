import * as THREE from "three";
import type { VehicleId } from "@shared/types";
import { VEHICLES } from "@shared/vehicles";
import { makeHullGeometry, makeJetskiHullGeometry } from "./boatMeshes";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { fitToSize, loadModel, wrapRotated } from "../core/Assets";
import { applyEnvIntensityTo } from "../world/env";
import { currentTier } from "../core/Quality";

/**
 * Realistlikud GLB-vasted (Sketchfab CC-BY, käsitsi laaditavad —
 * vt public/ATTRIBUTION.md ja scripts/fetch-assets.sh). Faili puudumisel
 * jääb protseduuriline PBR-kere. Kenney low-poly GLB-d on teadlikult
 * demotud (PBR-maailmas näeksid halvemad välja kui protseduuriline kere),
 * failid on public/models/ alles kui varuvariant.
 */
const VEHICLE_MODELS: Partial<Record<VehicleId, { file: string; rotY: number; draft: number }>> = {
  // rotY: mudeli pikitelg keeratakse mängu +Z suunda (visuaalselt kontrollitud)
  kiirpaat: { file: "boat-speed", rotY: -Math.PI / 2, draft: 0.22 },
  kaater: { file: "boat-riva", rotY: -Math.PI / 2, draft: 0.24 },
  kalapaat: { file: "boat-fishing", rotY: 0, draft: 0.6 },
  jett: { file: "jetski-regular", rotY: -Math.PI / 2, draft: 0.12 },
  sportjett: { file: "jetski-sport", rotY: -Math.PI / 2, draft: 0.1 },
};

/**
 * Eellaadimine menüü ajal: mudelid parsitakse ja tekstuurid laaditakse GPU-le
 * enne sõidu algust, nii et spawnimisel toimub GLB-vahetus samas kaadris ja
 * mängija ei näe protseduurilist vahevarianti.
 */
export async function preloadVehicleModels(renderer?: THREE.WebGLRenderer): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const cfg of Object.values(VEHICLE_MODELS)) {
    tasks.push(loadModel(cfg.file, false).then((m) => {
      if (!m || !renderer) return;
      m.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const mat of mats) {
            if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
            for (const t of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap, mat.emissiveMap]) {
              if (t) renderer.initTexture(t);
            }
          }
        }
      });
    }));
  }
  await Promise.all(tasks);
}

/** Kere põhivärvid sõidukite kaupa */
const HULL_COLORS: Record<VehicleId, number> = {
  kiirpaat: 0xf2f3f4,
  kaater: 0x15181d,
  kalapaat: 0x28536b,
  jett: 0xf2f3f4,
  sportjett: 0x1c1f24,
};

/** Peen müra-normalmap clearcoat'ile — metallikvärvi flake-efekt */
let flakeTex: THREE.CanvasTexture | null = null;
function flakeNormal(): THREE.CanvasTexture {
  if (flakeTex) return flakeTex;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    img.data[i * 4] = 128 + Math.round((Math.random() * 2 - 1) * 20);
    img.data[i * 4 + 1] = 128 + Math.round((Math.random() * 2 - 1) * 20);
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  flakeTex = new THREE.CanvasTexture(c);
  flakeTex.wrapS = flakeTex.wrapT = THREE.RepeatWrapping;
  flakeTex.repeat.set(18, 18);
  return flakeTex;
}

function hullMaterial(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.18,
    metalness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    clearcoatNormalMap: flakeNormal(),
    clearcoatNormalScale: new THREE.Vector2(0.35, 0.35),
  });
}

function accentMaterial(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.3,
    metalness: 0.15,
    clearcoat: 0.9,
    clearcoatRoughness: 0.15,
    clearcoatNormalMap: flakeNormal(),
    clearcoatNormalScale: new THREE.Vector2(0.3, 0.3),
  });
}

// envMapIntensity tuleb ilmast (applyEnvIntensityTo), mitte enam hardcoded
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x0c1a24,
  roughness: 0.05,
  metalness: 0.4,
});
const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.7 });
const seatMat = new THREE.MeshStandardMaterial({ color: 0x2e3338, roughness: 0.9 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0xb8bec4, roughness: 0.35, metalness: 0.9 });

function outboardMotor(cowl: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  // Ümardatud kate näeb clearcoat'iga päris mootori moodi välja
  const head = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.36, 0.52, 3, 0.07), cowl);
  head.position.y = 0.45;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.6, 8), darkMat);
  leg.position.y = 0;
  // Kavitatsiooniplaat + skeg-uim
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.3), darkMat);
  plate.position.set(0, -0.24, -0.02);
  const skeg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.2), darkMat);
  skeg.position.set(0, -0.36, 0.02);
  // Propeller
  const prop = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.11, 0.06), steelMat);
    blade.position.y = 0.06;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    holder.add(blade);
    prop.add(holder);
  }
  prop.rotation.x = Math.PI / 2;
  prop.position.set(0, -0.28, -0.16);
  g.add(head, leg, plate, skeg, prop);
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

  // Füüsiline klaas ainult astmetel, kus transmission on lubatud (kallis pass)
  const trans = currentTier.glassTransmission;
  if ((glassMat.transmission > 0) !== trans) {
    glassMat.transmission = trans ? 0.9 : 0;
    glassMat.thickness = trans ? 0.05 : 0;
    glassMat.ior = 1.5;
    glassMat.needsUpdate = true;
  }

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
  applyEnvIntensityTo(group);

  // Progressiivne täiustus: kui GLB-mudel on olemas, asenda protseduuriline.
  // Mängija värv jääb nähtavaks ahtrivimplina.
  const cfg = VEHICLE_MODELS[id];
  if (cfg) {
    // matte=false: realistlike mudelite PBR-materjalid jäävad puutumata
    void loadModel(cfg.file, false).then((m) => {
      if (!m) return;
      const wrapped = wrapRotated(m, cfg.rotY);
      fitToSize(wrapped, s.hullLength, "z");
      wrapped.position.y -= cfg.draft;
      group.clear();
      group.add(wrapped);
      group.add(buildPennant(accentColor, s.hullLength));
      applyEnvIntensityTo(group);
      // Kummitus/kaugpaat saab uued materjalid üle käia (läbipaistvus jm)
      (group.userData.onModelSwapped as (() => void) | undefined)?.();
    });
  }
  return group;
}

/** Väike lehvik-vimpel ahtris — mängija värvi tuvastus GLB-paatidel */
function buildPennant(color: number, hullLength: number): THREE.Group {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.1, 6), darkMat);
  mast.position.y = 0.9;
  g.add(mast);
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(0.55, 0.14);
  flagShape.lineTo(0, 0.28);
  flagShape.closePath();
  const flag = new THREE.Mesh(
    new THREE.ShapeGeometry(flagShape),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide }),
  );
  flag.position.set(0, 1.16, 0);
  flag.rotation.y = Math.PI / 2;
  g.add(flag);
  g.position.set(0, 0, -hullLength * 0.42);
  return g;
}
