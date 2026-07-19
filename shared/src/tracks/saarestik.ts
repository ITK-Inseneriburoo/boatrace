import type { TrackDef } from "./types";

/**
 * Saarestik — avameri, männisaared, rannavahud.
 * Ringrada saarte vahel, idakülje kiire S-šikaan, hüpperambid ning kivid
 * ja palgid, mis sunnivad sirgetel sõiduliini valima.
 */
export const saarestik: TrackDef = {
  id: "saarestik",
  nimi: "Saarestik",
  kirjeldus: "Kiire S-šikaan, karid ja riskiliinid männisaarte vahel",
  defaultLaps: 2,
  seed: 1337,
  ghostVersion: 3,
  route: [
    [0, -270],
    [145, -250],
    // Ida S-šikaan: välimine → sisemine → välimine → sisemine
    [260, -175],
    [205, -75],
    [285, 30],
    [210, 140],
    [175, 185],
    [55, 235],
    [-95, 255],
    [-215, 175],
    [-270, 45],
    [-245, -100],
    [-155, -210],
  ],
  routeWidth: 26,
  terrain: {
    size: 900,
    islands: [
      { x: 10, z: 0, r: 105, h: 13 }, // kesksaar
      { x: 160, z: -330, r: 70, h: 8 },
      { x: 350, z: -70, r: 85, h: 11 },
      { x: 270, z: 270, r: 90, h: 12 },
      { x: -30, z: 340, r: 75, h: 9 },
      { x: -310, z: 250, r: 65, h: 8 },
      { x: -370, z: -30, r: 85, h: 12 },
      { x: -240, z: -300, r: 85, h: 9 },
      { x: 90, z: -140, r: 44, h: 5 }, // kaluriküla saar
      { x: -140, z: 120, r: 26, h: 3.5 },
      { x: 170, z: 60, r: 22, h: 3 },
    ],
    noiseScale: 0.011,
    noiseAmp: 9,
    baseDepth: 9,
    carveWidth: 44,
  },
  gates: [
    { t: 0.045, offset: -3, width: 20 },
    { t: 0.1, offset: 4, width: 19 },
    { t: 0.155, offset: -5, width: 17 },
    { t: 0.21, offset: 4, width: 19 },
    { t: 0.265, offset: -3, width: 19 },
    { t: 0.32, offset: 5, width: 18 },
    { t: 0.375, offset: 2, width: 19 },
    { t: 0.43, offset: -5, width: 18 },
    { t: 0.49, offset: 5, width: 17 },
    { t: 0.545, offset: -4, width: 19 },
    { t: 0.6, offset: 4, width: 18 },
    { t: 0.66, offset: -5, width: 18 },
    { t: 0.715, offset: 3, width: 19 },
    { t: 0.77, offset: 5, width: 18 },
    { t: 0.825, offset: -5, width: 17 },
    { t: 0.88, offset: 4, width: 19 },
    { t: 0.94, offset: -3, width: 20 },
  ],
  ramps: [
    { t: 0.12, offset: -3, height: 2.2, length: 14 },
    { t: 0.46, offset: 4, height: 2.4, length: 15 },
    { t: 0.94, offset: -3, height: 2.5, length: 14 },
  ],
  boosts: [
    { t: 0.08, offset: -6, radius: 5.5, power: 8 },
    { t: 0.29, offset: 5, radius: 5.5, power: 8 },
    { t: 0.42, offset: -5, radius: 5.5, power: 8 },
    { t: 0.9, offset: 5, radius: 6, power: 9 },
  ],
  obstacles: [
    { kind: "kivi", t: 0.03, offset: 10, scale: 1.3 },
    { kind: "palk", t: 0.18, offset: 2, scale: 1.1 },
    { kind: "kivi", t: 0.24, offset: -9, scale: 1.5 },
    { kind: "kivi", t: 0.34, offset: 12 },
    { kind: "palk", t: 0.39, offset: -2, scale: 1.1 },
    { kind: "kivi", t: 0.54, offset: -11, scale: 1.4 },
    { kind: "palk", t: 0.61, offset: 2 },
    { kind: "kivi", t: 0.68, offset: -8 },
    { kind: "kivi", t: 0.76, offset: 13, scale: 1.2 },
    { kind: "palk", t: 0.83, offset: -2, scale: 1.1 },
    { kind: "kivi", t: 0.87, offset: 8, scale: 1.1 },
  ],
  props: [
    { kind: "kai", x: 96, z: -68, rot: 2.2 },
    { kind: "tuletorn", x: -352, z: -95, scale: 1.1 },
    { kind: "majakas", x: 150, z: 175 },
    { kind: "majakas", x: -195, z: -32 },
    { kind: "lipp", x: 88, z: -78 },
  ],
  treesPerIsland: 26,
  allowedWeathers: ["paike", "torm", "udu"],
};
