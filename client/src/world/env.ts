import * as THREE from "three";

/**
 * Hetke ilma envMapIntensity. Ilmavahetus pühib kogu stseeni läbi, aga
 * hiljem loodavad materjalid (paadid spawnitakse pärast ilma rakendamist)
 * peavad väärtuse ise siit võtma — sellepärast moodulimuutuja.
 */
export let currentEnvIntensity = 1.0;

export function setCurrentEnvIntensity(v: number): void {
  currentEnvIntensity = v;
}

/** Sea envMapIntensity kõigile alampuu standard/physical-materjalidele */
export function applyEnvIntensityTo(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial) m.envMapIntensity = currentEnvIntensity;
      }
    }
  });
}
