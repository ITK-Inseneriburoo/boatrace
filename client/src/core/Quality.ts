import type { PipelineConfig } from "../fx/PostPipeline";

/** Graafikaastmed. Järjekord kõrgeimast madalaimani (auto-langetuse jaoks). */
export type GraphicsLevel = "ultra" | "korge" | "keskmine" | "madal";

export const LEVEL_ORDER: GraphicsLevel[] = ["ultra", "korge", "keskmine", "madal"];

export interface QualityTier {
  pixelRatio: number;
  shadows: boolean;
  shadowRes: number;
  pipeline: PipelineConfig;
  /** PBR-tekstuuride eelistatud resolutsioon + anisotroopia */
  texRes: "1k" | "2k";
  anisotropy: number;
  /** Partikliarvude kordaja (vihm, pritsmed) */
  particleScale: number;
  /** Ookeani lisad */
  ocean: { foamTex: boolean; shoreAlpha: boolean; planarRes: 0 | 512 | 1024 };
  /** Maastiku splat-shaderi detail-normalmapid */
  terrainNormals: boolean;
  /** Paadiklaasi füüsiline transmission (kallis — eraldi render-pass) */
  glassTransmission: boolean;
}

/**
 * Üks tabel = üks tõde. Game.applyGraphics delegeerib siit
 * pipeline'ile, varjudele, ookeanile, tekstuuritele ja partiklitele.
 */
export const QUALITY_TIERS: Record<GraphicsLevel, QualityTier> = {
  ultra: {
    pixelRatio: 2.0,
    shadows: true,
    shadowRes: 4096,
    pipeline: { composer: true, samples: 4, aa: "smaa", bloom: true, gtao: true },
    texRes: "2k",
    anisotropy: 16,
    particleScale: 1.0,
    ocean: { foamTex: true, shoreAlpha: true, planarRes: 1024 },
    terrainNormals: true,
    glassTransmission: true,
  },
  korge: {
    pixelRatio: 1.5,
    shadows: true,
    shadowRes: 2048,
    pipeline: { composer: true, samples: 4, aa: "smaa", bloom: true, gtao: false },
    texRes: "2k",
    anisotropy: 16,
    particleScale: 1.0,
    ocean: { foamTex: true, shoreAlpha: true, planarRes: 512 },
    terrainNormals: true,
    glassTransmission: true,
  },
  keskmine: {
    pixelRatio: 1.25,
    shadows: true,
    shadowRes: 1024,
    pipeline: { composer: true, samples: 0, aa: "fxaa", bloom: true, gtao: false },
    texRes: "1k",
    anisotropy: 4,
    particleScale: 0.7,
    ocean: { foamTex: true, shoreAlpha: false, planarRes: 0 },
    terrainNormals: true,
    glassTransmission: true,
  },
  madal: {
    // composer väljas → canvas'e enda MSAA, tone mapping renderer'is
    pixelRatio: 1.0,
    shadows: false,
    shadowRes: 512,
    pipeline: { composer: false, samples: 0, aa: "none", bloom: false, gtao: false },
    texRes: "1k",
    anisotropy: 1,
    particleScale: 0.4,
    ocean: { foamTex: false, shoreAlpha: false, planarRes: 0 },
    terrainNormals: false,
    glassTransmission: false,
  },
};

/** Aste allapoole või null, kui juba madalaim */
export function lowerLevel(level: GraphicsLevel): GraphicsLevel | null {
  const i = LEVEL_ORDER.indexOf(level);
  return i >= 0 && i < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[i + 1] : null;
}

/** Hetkel kehtiv ast — moodulid, mis ehitavad sisu hiljem (Terrain jt), loevad siit */
export let currentTier: QualityTier = QUALITY_TIERS.korge;
export function setCurrentTier(t: QualityTier): void {
  currentTier = t;
}
