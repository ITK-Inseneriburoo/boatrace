import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * Valikuliste glTF-mudelite laadija (Kenney watercraft kit, CC0).
 * Kõik kasutuskohad ehitavad KÕIGEPEALT protseduurilise variandi ja
 * asendavad selle mudeli saabumisel — 404/viga = jääb protseduuriline.
 */
const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group | null>>();

export function loadModel(name: string): Promise<THREE.Group | null> {
  let p = cache.get(name);
  if (!p) {
    p = loader
      .loadAsync(`/models/${name}.glb`)
      .then((gltf) => {
        const g = gltf.scene;
        g.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            // Kenney tekstuurid on teravad low-poly värvid — hoia matina
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              if (m instanceof THREE.MeshStandardMaterial) m.roughness = 0.85;
            }
          }
        });
        return g;
      })
      .catch(() => null);
    cache.set(name, p);
  }
  // Iga kasutaja saab oma klooni
  return p.then((g) => (g ? (g.clone(true) as THREE.Group) : null));
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
