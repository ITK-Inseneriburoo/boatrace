import * as THREE from "three";
import { isAppleMobile } from "./Platform";
import type { QualityTier } from "./Quality";

export type GraphicsCompatibilityMode = "auto" | "safe" | "off";

export interface GraphicsAdapterInfo {
  vendor: string;
  renderer: string;
  version: string;
}

type QualityOverrides = Partial<
  Omit<QualityTier, "pixelRatio" | "pipeline" | "ocean">
> & {
  /** Piirab astme väärtust, aga ei tõsta madalama astme pixel ratio't. */
  maxPixelRatio?: number;
  pipeline?: Partial<QualityTier["pipeline"]>;
  ocean?: Partial<QualityTier["ocean"]>;
};

export interface GraphicsWorkaround {
  id: string;
  reason: string;
  overrides: QualityOverrides;
}

export interface GraphicsCompatibility {
  mode: GraphicsCompatibilityMode;
  adapter: GraphicsAdapterInfo;
  workarounds: readonly GraphicsWorkaround[];
}

interface DetectionContext {
  adapter: GraphicsAdapterInfo;
  appleMobile: boolean;
}

interface WorkaroundRule extends GraphicsWorkaround {
  matches: (ctx: DetectionContext) => boolean;
}

/**
 * Teadaolevate täiskaadri vilkumiste workaround'id elavad ainult siin.
 * Uue draiverivea lisamiseks kirjelda kitsas `matches`-reegel ja võimalikult
 * väike kvaliteedi override; graafikaastmeid ega Game'i seadme-if'e pole vaja
 * selleks muuta.
 */
const AUTO_RULES: readonly WorkaroundRule[] = [
  {
    id: "ipad-webkit-offscreen-compositing",
    reason: "iPadOS WebKit võib HalfFloat offscreen-renderdusega musti kaadreid näidata.",
    matches: ({ appleMobile }) => appleMobile,
    overrides: {
      maxPixelRatio: 1.25,
      pipeline: { composer: false, samples: 0, aa: "none", bloom: false, gtao: false },
      ocean: { planarRes: 0 },
      glassTransmission: false,
    },
  },
  {
    id: "adreno-x1-d3d11-terrain-normals",
    reason:
      "Adreno X1 D3D11/ANGLE draiver vilgub loodusmaastiku detail-normalite shaderiga.",
    matches: ({ adapter }) =>
      /adreno(?:\(tm\))?.*\bx1(?:-\d+)?\b/i.test(adapter.renderer) &&
      /direct3d11|\bd3d11\b/i.test(adapter.renderer),
    // Splat-värvid, varjud ja post-processing jäävad alles; eemaldame ainult
    // Sadamalinnast puuduva ja loodusradadel vea vallandava shaderiharu.
    overrides: { terrainNormals: false },
  },
];

/** Käsitsi varutee tundmatu GPU vilkumise kiireks diagnoosimiseks. */
const SAFE_WORKAROUND: GraphicsWorkaround = {
  id: "forced-safe-render-path",
  reason: "Kasutaja sundis URL-ist ohutu otserenderduse (`gpuCompat=safe`).",
  overrides: {
    maxPixelRatio: 1.25,
    pipeline: { composer: false, samples: 0, aa: "none", bloom: false, gtao: false },
    ocean: { planarRes: 0 },
    terrainNormals: false,
    glassTransmission: false,
  },
};

function readMode(): GraphicsCompatibilityMode {
  const value = new URLSearchParams(location.search).get("gpuCompat");
  if (value === "safe" || value === "off") return value;
  return "auto";
}

function readAdapter(renderer: THREE.WebGLRenderer): GraphicsAdapterInfo {
  const gl = renderer.getContext();
  const debug = gl.getExtension("WEBGL_debug_renderer_info");

  const vendor = debug
    ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
    : gl.getParameter(gl.VENDOR);
  const rendererName = debug
    ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);

  return {
    vendor: String(vendor ?? "tundmatu"),
    renderer: String(rendererName ?? "tundmatu"),
    version: String(gl.getParameter(gl.VERSION) ?? "tundmatu"),
  };
}

export function detectGraphicsCompatibility(
  renderer: THREE.WebGLRenderer,
): GraphicsCompatibility {
  const mode = readMode();
  const adapter = readAdapter(renderer);
  const context: DetectionContext = { adapter, appleMobile: isAppleMobile() };

  let workarounds: readonly GraphicsWorkaround[];
  if (mode === "off") {
    workarounds = [];
  } else if (mode === "safe") {
    workarounds = [SAFE_WORKAROUND];
  } else {
    workarounds = AUTO_RULES.filter((rule) => rule.matches(context));
  }

  const result = { mode, adapter, workarounds };
  console.info("[Boatrace graafika]", {
    mode,
    adapter,
    workarounds: workarounds.map(({ id, reason }) => ({ id, reason })),
  });
  return result;
}

/** Rakendab kõik sobivad reeglid järjekorras uuele tier-objektile. */
export function applyGraphicsCompatibility(
  selectedTier: QualityTier,
  compatibility: GraphicsCompatibility,
): QualityTier {
  let tier: QualityTier = {
    ...selectedTier,
    pipeline: { ...selectedTier.pipeline },
    ocean: { ...selectedTier.ocean },
  };

  for (const { overrides } of compatibility.workarounds) {
    const { maxPixelRatio, pipeline, ocean, ...flat } = overrides;
    tier = {
      ...tier,
      ...flat,
      pixelRatio:
        maxPixelRatio === undefined ? tier.pixelRatio : Math.min(tier.pixelRatio, maxPixelRatio),
      pipeline: { ...tier.pipeline, ...pipeline },
      ocean: { ...tier.ocean, ...ocean },
    };
  }

  return tier;
}
