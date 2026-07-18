import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/**
 * Valikuliste glTF-mudelite laadija (Kenney kit, Sketchfab CC-BY sõidukid jm —
 * vt public/ATTRIBUTION.md). Kõik kasutuskohad ehitavad KÕIGEPEALT
 * protseduurilise variandi ja asendavad selle mudeli saabumisel —
 * 404/viga = jääb protseduuriline.
 */
const loader = new GLTFLoader();
// Meshopt-pakitud GLB-d (suured propsid) — dekooder on three'i addon, faile ei vaja
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<THREE.Group | null>>();

/**
 * matte=true (vaikimisi, Kenney low-poly): roughness surutakse matiks.
 * matte=false (realistlikud PBR-mudelid): materjalid jäävad puutumata.
 */
export function loadModel(name: string, matte = true): Promise<THREE.Group | null> {
  const key = `${name}|${matte}`;
  let p = cache.get(key);
  if (!p) {
    p = loader
      .loadAsync(`/models/${name}.glb`)
      .then((gltf) => {
        const g = gltf.scene;
        g.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              if (!(m instanceof THREE.MeshStandardMaterial)) continue;
              if (matte) {
                // Kenney tekstuurid on teravad low-poly värvid — hoia matina
                m.roughness = 0.85;
              }
              // Sketchfabi eksportides on põhimaterjal tihti ekslikult
              // BLEND-režiimis alpha≈1-ga → kogu mudel paistab kergelt läbi
              // (kahepoolne blend-sortimine). Tee läbipaistmatuks; tekstuuri
              // alfaga klaasiosad jäävad alphaTest-väljalõikena läbipaistvaks.
              // Päris klaas (opacity < 1) jääb blend'iks.
              if (m.transparent && m.opacity >= 0.99) {
                m.transparent = false;
                m.alphaTest = 0.35;
                m.depthWrite = true;
                m.needsUpdate = true;
              }
            }
          }
        });
        return g;
      })
      .catch((err) => {
        // 404 on ootuspärane (progressiivne täiustus); parse-viga tasub näha
        console.warn(`loadModel: ${name} jäi protseduuriliseks:`, err?.message ?? err);
        return null;
      });
    cache.set(key, p);
  }
  // Iga kasutaja saab oma klooni. NB: clone(true) jagab materjale —
  // kloonime ka need, muidu ühe paadi läbipaistvaks tegemine (kummitus,
  // pealtvaataja) muudab KÕIK sama GLB-ga paadid läbipaistvaks.
  return p.then((g) => {
    if (!g) return null;
    const c = g.clone(true) as THREE.Group;
    c.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => m.clone())
          : o.material.clone();
      }
    });
    return c;
  });
}

/**
 * Mähi mudel pöördega gruppi — GLB juurel võib olla baked-rotatsioon,
 * mida ei tohi üle kirjutada.
 */
export function wrapRotated(m: THREE.Group, rotY: number): THREE.Group {
  const w = new THREE.Group();
  w.rotation.y = rotY;
  w.add(m);
  const outer = new THREE.Group();
  outer.add(w);
  return outer;
}

/**
 * Skaleeri ja tsentreeri mudel soovitud mõõtu.
 * axis: milline bbox-telg peab vastama `size`-le (ühtlane skaala).
 */
export function fitToSize(g: THREE.Group, size: number, axis: "x" | "y" | "z"): void {
  const box = new THREE.Box3().setFromObject(g);
  const dims = new THREE.Vector3();
  box.getSize(dims);
  const s = size / Math.max(dims[axis], 1e-4);
  g.scale.setScalar(s);
  // Tsentreeri XZ, põhi veepiirile
  const c = new THREE.Vector3();
  box.getCenter(c);
  g.position.x -= c.x * s;
  g.position.z -= c.z * s;
  g.position.y -= box.min.y * s;
}

/** Skaleeri mudel bbox-mõõtudesse (mitteühtlane) */
export function fitToBox(g: THREE.Group, sx: number, sy: number, sz: number): void {
  const box = new THREE.Box3().setFromObject(g);
  const dims = new THREE.Vector3();
  box.getSize(dims);
  g.scale.set(
    sx / Math.max(dims.x, 1e-4),
    sy / Math.max(dims.y, 1e-4),
    sz / Math.max(dims.z, 1e-4),
  );
  const c = new THREE.Vector3();
  box.getCenter(c);
  g.position.x -= c.x * g.scale.x;
  g.position.z -= c.z * g.scale.z;
  g.position.y -= box.min.y * g.scale.y;
}
