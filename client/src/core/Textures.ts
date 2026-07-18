import * as THREE from "three";

/**
 * PBR-tekstuurisettide laadija. Ainus koht, kus bitmap-tekstuure laaditakse —
 * värviruumi määramine on koondatud siia, sest see on suurim vearisk:
 * albedo PEAB olema SRGBColorSpace, normal/roughness/ao PEAVAD jääma lineaarseks.
 * Sama filosoofia kui Assets.loadModel: 404 → null → kasutuskoht jääb
 * protseduurilise materjali juurde.
 */

export interface PbrSet {
  color: THREE.Texture;
  normal: THREE.Texture | null;
  rough: THREE.Texture | null;
  ao: THREE.Texture | null;
}

const loader = new THREE.TextureLoader();
const cache = new Map<string, Promise<PbrSet | null>>();
/** Kõik välja antud tekstuurid, et anisotroopiat saaks astmevahetuse järel muuta */
const issued = new Set<THREE.Texture>();

let texRes: "1k" | "2k" = "1k";
let anisotropy = 4;

/** Hetke tekstuuriresolutsioon (ka HDRI failivaliku jaoks SkySystem'is) */
export function getTextureRes(): "1k" | "2k" {
  return texRes;
}

/** Kutsu Game.applyGraphics'ist. Uuendab ka juba laetud tekstuure. */
export function setTextureQuality(res: "1k" | "2k", aniso: number, maxAniso: number): void {
  texRes = res;
  anisotropy = Math.min(aniso, maxAniso);
  for (const t of issued) {
    t.anisotropy = anisotropy;
    t.needsUpdate = true;
  }
}

function setup(t: THREE.Texture, srgb: boolean): THREE.Texture {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  issued.add(t);
  return t;
}

function tryLoad(url: string, srgb: boolean): Promise<THREE.Texture | null> {
  return loader
    .loadAsync(url)
    .then((t) => setup(t, srgb))
    .catch(() => null);
}

/**
 * Lae sett `{base}_{res}_{color|normal|rough|ao}.webp`.
 * `res` valitakse astme järgi; kui 2k color'it pole, proovitakse 1k.
 * Tagastab null kui color puudub (normal/rough/ao on valikulised).
 */
export function loadPbrSet(base: string): Promise<PbrSet | null> {
  const key = `${base}@${texRes}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      let res: "1k" | "2k" = texRes;
      let color = await tryLoad(`${base}_${res}_color.webp`, true);
      if (!color && res === "2k") {
        res = "1k";
        color = await tryLoad(`${base}_${res}_color.webp`, true);
      }
      if (!color) return null;
      const [normal, rough, ao] = await Promise.all([
        tryLoad(`${base}_${res}_normal.webp`, false),
        tryLoad(`${base}_${res}_rough.webp`, false),
        tryLoad(`${base}_${res}_ao.webp`, false),
      ]);
      return { color, normal, rough, ao };
    })();
    cache.set(key, p);
  }
  return p;
}

/** Lae üksik tekstuur (nt vee detail-normal). srgb=true ainult värvikaartidele. */
export function loadTexture(url: string, srgb: boolean): Promise<THREE.Texture | null> {
  return tryLoad(url, srgb);
}

/**
 * Rakenda sett olemasolevale materjalile. `material.color` jääb tindiks
 * (three korrutab map * color) — aktsentvärvidega slotid jäävad tööle.
 * Iga mesh saab kloonitud repeat'i vajadusel ise üle kirjutada.
 */
export function applyPbr(
  material: THREE.MeshStandardMaterial,
  set: PbrSet,
  repeat = 1,
): void {
  const rep = (t: THREE.Texture | null): THREE.Texture | null => {
    if (t) t.repeat.set(repeat, repeat);
    return t;
  };
  material.map = rep(set.color);
  material.normalMap = rep(set.normal);
  material.roughnessMap = rep(set.rough);
  material.aoMap = rep(set.ao);
  // Protseduurilisel geomeetrial pole teist UV-kanalit — AO samalt uv0-lt
  if (set.ao) set.ao.channel = 0;
  material.needsUpdate = true;
}
