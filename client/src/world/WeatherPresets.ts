import type { WeatherId } from "@shared/types";
import { WAVE_SETS, type WaveSet } from "@shared/waves";

export interface WeatherPreset {
  id: WeatherId;
  nimi: string;
  /** Päikese kõrgus ja asimuut kraadides (Sky shaderi + valguse jaoks) */
  sunElevation: number;
  sunAzimuth: number;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  fogColor: number;
  fogDensity: number;
  sunColor: number;
  sunIntensity: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  hemiIntensity: number;
  exposure: number;
  waves: WaveSet;
  waterDeep: number;
  waterShallow: number;
  /** Mida madalam, seda kergemini tekivad laineharjadele vahud */
  foamLevel: number;
  rainCount: number;
  lightning: boolean;
}

export const WEATHERS: Record<WeatherId, WeatherPreset> = {
  paike: {
    id: "paike",
    nimi: "Päikseline",
    sunElevation: 42,
    sunAzimuth: 145,
    turbidity: 2.5,
    rayleigh: 1.1,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.8,
    fogColor: 0xbcd8e8,
    fogDensity: 0.0016,
    sunColor: 0xfff3e0,
    sunIntensity: 2.6,
    hemiSkyColor: 0x9ecbee,
    hemiGroundColor: 0x2a4a55,
    hemiIntensity: 0.55,
    exposure: 0.75,
    waves: WAVE_SETS.paike,
    waterDeep: 0x0e3d54,
    waterShallow: 0x35b6ac,
    foamLevel: 0.72,
    rainCount: 0,
    lightning: false,
  },
  torm: {
    id: "torm",
    nimi: "Torm",
    sunElevation: 22,
    sunAzimuth: 160,
    turbidity: 24,
    rayleigh: 4.5,
    mieCoefficient: 0.003,
    mieDirectionalG: 0.7,
    fogColor: 0x4a585e,
    fogDensity: 0.006,
    sunColor: 0xb8c4c9,
    sunIntensity: 0.9,
    hemiSkyColor: 0x5c6d75,
    hemiGroundColor: 0x1d2b30,
    hemiIntensity: 0.45,
    exposure: 0.42,
    waves: WAVE_SETS.torm,
    waterDeep: 0x14333d,
    waterShallow: 0x3d6a63,
    foamLevel: 0.42,
    rainCount: 3000,
    lightning: true,
  },
  udu: {
    id: "udu",
    nimi: "Udune õhtu",
    sunElevation: 4,
    sunAzimuth: 250,
    turbidity: 8,
    rayleigh: 2.6,
    mieCoefficient: 0.012,
    mieDirectionalG: 0.9,
    fogColor: 0xd8b28f,
    fogDensity: 0.012,
    sunColor: 0xffb36b,
    sunIntensity: 1.6,
    hemiSkyColor: 0xc79a72,
    hemiGroundColor: 0x3a3040,
    hemiIntensity: 0.45,
    exposure: 0.68,
    waves: WAVE_SETS.udu,
    waterDeep: 0x2a2f45,
    waterShallow: 0x7a6a58,
    foamLevel: 0.85,
    rainCount: 0,
    lightning: false,
  },
};
