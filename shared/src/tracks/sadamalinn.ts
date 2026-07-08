import type { TrackDef } from "./types";

/**
 * Sadamalinn — tööstuslik sadam: konteineriterminal, portaalkraanad,
 * kaubalaevad, laohooned, kaid ja muulid. Rada lookleb basseine pidi.
 */
export const sadamalinn: TrackDef = {
  id: "sadamalinn",
  nimi: "Sadamalinn",
  kirjeldus: "Kraanade ja kaubalaevade vahel läbi tööstussadama",
  defaultLaps: 3,
  seed: 7001,
  route: [
    [0, -180],
    [140, -160],
    [230, -60],
    [240, 80],
    [150, 180],
    [10, 210],
    [-140, 190],
    [-230, 90],
    [-240, -40],
    [-170, -140],
    [-80, -185],
  ],
  routeWidth: 24,
  terrain: {
    size: 800,
    islands: [
      // Põhjakai (mandri serv) — lamedad tööstusplatvormid
      { x: -160, z: -290, r: 100, h: 5.5 },
      { x: 0, z: -310, r: 110, h: 6 },
      { x: 160, z: -290, r: 100, h: 5.5 },
      // Idaterminal
      { x: 330, z: -30, r: 100, h: 5 },
      { x: 350, z: 140, r: 85, h: 5 },
      // Lõunadokid
      { x: 40, z: 330, r: 115, h: 5.5 },
      { x: -180, z: 300, r: 80, h: 5 },
      // Läänekai
      { x: -340, z: -20, r: 95, h: 5.5 },
      { x: -300, z: -180, r: 70, h: 5 },
      // Keskne kaisaar, mille ümber rada käib
      { x: 20, z: 20, r: 70, h: 4.5 },
    ],
    noiseScale: 0.008,
    noiseAmp: 3.5,
    baseDepth: 8,
    carveWidth: 40,
  },
  gates: [
    { t: 0.05 },
    { t: 0.11 },
    { t: 0.17, width: 19 },
    { t: 0.23 },
    { t: 0.29 },
    { t: 0.36, width: 20 },
    { t: 0.43 },
    { t: 0.5 },
    { t: 0.57, width: 19 },
    { t: 0.64 },
    { t: 0.71 },
    { t: 0.78, width: 20 },
    { t: 0.85 },
    { t: 0.92 },
  ],
  ramps: [
    { t: 0.33, offset: 3, height: 2.2, length: 13 },
    { t: 0.68, offset: -4, height: 2.5, length: 14 },
  ],
  boosts: [
    { t: 0.16, offset: 5, radius: 5.5, power: 8 },
    { t: 0.42, offset: -6, radius: 5, power: 9 },
    { t: 0.73, offset: 6, radius: 5.5, power: 8 },
  ],
  obstacles: [
    { kind: "palk", t: 0.08, offset: 8 },
    { kind: "kivi", t: 0.2, offset: -10, scale: 1.2 },
    { kind: "palk", t: 0.31, offset: -7 },
    { kind: "palk", t: 0.46, offset: 9 },
    { kind: "kivi", t: 0.61, offset: -9 },
    { kind: "palk", t: 0.75, offset: 8 },
    { kind: "kivi", t: 0.88, offset: -11, scale: 0.9 },
  ],
  props: [
    // Põhjakai tööstus: kraanad + konteinerid + laev
    { kind: "kraana", x: -120, z: -238, rot: 0 },
    { kind: "kraana", x: 10, z: -252, rot: 0 },
    { kind: "kraana", x: 140, z: -238, rot: 0 },
    { kind: "konteinerivirn", x: -70, z: -262, rot: 0.2 },
    { kind: "konteinerivirn", x: 65, z: -272, rot: -0.15 },
    { kind: "konteinerivirn", x: 185, z: -258, rot: 0.3 },
    { kind: "kaubalaev", x: -30, z: -218, rot: 1.62 },
    // Idaterminal: laod + konteinerid
    { kind: "ladu", x: 320, z: 10, rot: 1.57 },
    { kind: "ladu", x: 335, z: 105, rot: 1.57 },
    { kind: "konteinerivirn", x: 292, z: 60, rot: 1.4 },
    { kind: "kraana", x: 275, z: -50, rot: 2.2 },
    // Lõunadokid: teine kaubalaev + kaid
    { kind: "kaubalaev", x: 30, z: 262, rot: -1.45 },
    { kind: "kai", x: -120, z: 255, rot: 0.6 },
    { kind: "kai", x: 140, z: 250, rot: -0.7 },
    // Läänekai
    { kind: "ladu", x: -330, z: -60, rot: 0 },
    { kind: "konteinerivirn", x: -295, z: 30, rot: -0.2 },
    { kind: "kai", x: -270, z: -130, rot: 2.3 },
    // Muulid + navigatsioon
    { kind: "muul", x: -60, z: 120, rot: 1.0 },
    { kind: "tuletorn", x: 258, z: 175, scale: 0.9 },
    { kind: "majakas", x: -175, z: 20 },
    { kind: "majakas", x: 120, z: -80 },
    // ITK lipud kaidel
    { kind: "lipp", x: -35, z: -258 },
    { kind: "lipp", x: 95, z: -262 },
    { kind: "lipp", x: 305, z: 55 },
    { kind: "lipp", x: -5, z: 288 },
  ],
  treesPerIsland: 3,
  allowedWeathers: ["paike", "torm", "udu"],
};
