import type { WeatherId } from "./types";

/**
 * Gerstner-laine parameetrid. KRIITILINE LEPING: sama matemaatika elab
 * GPU-s (client/src/world/ocean.vert.glsl) ja siin CPU-s — mõlemad PEAVAD
 * andma sama pinna, muidu ei istu paadid nähtavatel lainetel.
 *
 * faas = k * (dot(D, p) - c * t), kus k = 2π/L
 * nihe: x += Q·A·Dx·cos(faas); z += Q·A·Dz·cos(faas); y += A·sin(faas)
 */
export interface GerstnerWave {
  dirX: number;
  dirZ: number;
  amplitude: number;
  wavelength: number;
  steepness: number;
  /** faasikiirus m/s */
  speed: number;
}

export type WaveSet = readonly GerstnerWave[];

/** Merestik ilmade kaupa — alati täpselt 4 lainet (GPU uniform-massiivi suurus) */
export const WAVE_SETS: Record<WeatherId, WaveSet> = {
  paike: [
    { dirX: 1.0, dirZ: 0.15, amplitude: 0.16, wavelength: 55, steepness: 0.38, speed: 6.5 },
    { dirX: 0.7, dirZ: 0.7, amplitude: 0.09, wavelength: 27, steepness: 0.42, speed: 4.6 },
    { dirX: -0.3, dirZ: 0.9, amplitude: 0.05, wavelength: 13, steepness: 0.45, speed: 3.2 },
    { dirX: 0.9, dirZ: -0.5, amplitude: 0.03, wavelength: 6.5, steepness: 0.4, speed: 2.3 },
  ],
  torm: [
    { dirX: 1.0, dirZ: 0.25, amplitude: 0.65, wavelength: 85, steepness: 0.55, speed: 10.5 },
    { dirX: 0.75, dirZ: 0.65, amplitude: 0.38, wavelength: 42, steepness: 0.6, speed: 7.4 },
    { dirX: -0.2, dirZ: 1.0, amplitude: 0.19, wavelength: 21, steepness: 0.6, speed: 5.2 },
    { dirX: 0.85, dirZ: -0.55, amplitude: 0.1, wavelength: 9.5, steepness: 0.5, speed: 3.5 },
  ],
  udu: [
    { dirX: 1.0, dirZ: 0.05, amplitude: 0.1, wavelength: 75, steepness: 0.25, speed: 5.0 },
    { dirX: 0.85, dirZ: 0.5, amplitude: 0.05, wavelength: 38, steepness: 0.3, speed: 3.6 },
    { dirX: -0.4, dirZ: 0.85, amplitude: 0.022, wavelength: 16, steepness: 0.32, speed: 2.6 },
    { dirX: 0.8, dirZ: -0.6, amplitude: 0.012, wavelength: 7, steepness: 0.3, speed: 2.0 },
  ],
};

const TWO_PI = Math.PI * 2;

export interface WaveSample {
  dx: number;
  dy: number;
  dz: number;
}

/** Gerstner-nihe lattepunktis p=(x,z) (sama arvutus mis vertex-shaderis) */
export function waveDisplacement(
  waves: WaveSet,
  x: number,
  z: number,
  t: number,
  out: WaveSample,
): WaveSample {
  let dx = 0, dy = 0, dz = 0;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    const len = Math.hypot(w.dirX, w.dirZ);
    const Dx = w.dirX / len, Dz = w.dirZ / len;
    const k = TWO_PI / w.wavelength;
    const f = k * (Dx * x + Dz * z - w.speed * t);
    const c = Math.cos(f), s = Math.sin(f);
    dx += w.steepness * w.amplitude * Dx * c;
    dz += w.steepness * w.amplitude * Dz * c;
    dy += w.amplitude * s;
  }
  out.dx = dx;
  out.dy = dy;
  out.dz = dz;
  return out;
}

const tmp: WaveSample = { dx: 0, dy: 0, dz: 0 };

/**
 * Veepinna kõrgus maailmapunktis (x,z).
 * Gerstner nihutab punkte horisontaalselt, seega inverteerime iteratiivselt:
 * otsime lattepunkti, mille nihutatud asukoht on (x,z).
 */
export function getWaveHeight(waves: WaveSet, x: number, z: number, t: number): number {
  let px = x, pz = z;
  for (let i = 0; i < 3; i++) {
    waveDisplacement(waves, px, pz, t, tmp);
    px = x - tmp.dx;
    pz = z - tmp.dz;
  }
  waveDisplacement(waves, px, pz, t, tmp);
  return tmp.dy;
}

/** Pinnanormaal (analüütiline, sama valem mis shaderis) — [nx, ny, nz] */
export function getWaveNormal(
  waves: WaveSet,
  x: number,
  z: number,
  t: number,
): [number, number, number] {
  let gx = 0, gy = 0, gz = 0;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    const len = Math.hypot(w.dirX, w.dirZ);
    const Dx = w.dirX / len, Dz = w.dirZ / len;
    const k = TWO_PI / w.wavelength;
    const f = k * (Dx * x + Dz * z - w.speed * t);
    const c = Math.cos(f), s = Math.sin(f);
    gx += Dx * k * w.amplitude * c;
    gz += Dz * k * w.amplitude * c;
    gy += w.steepness * k * w.amplitude * s;
  }
  const nx = -gx, ny = 1 - gy, nz = -gz;
  const n = Math.hypot(nx, ny, nz);
  return [nx / n, ny / n, nz / n];
}
