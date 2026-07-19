import type { TrackDef } from "./types";

/**
 * Sadamalinn — tööstuslik sadam: konteineriterminal, portaalkraanad,
 * kaubalaevad, laohooned, kaid ja muulid. Rada lookleb basseine pidi.
 */
export const sadamalinn: TrackDef = {
  id: "sadamalinn",
  nimi: "Sadamalinn",
  kirjeldus: "Tehniline sadamaslalom kraanade ja kaubalaevade vahel",
  defaultLaps: 2,
  seed: 7001,
  ghostVersion: 2,
  route: [
    [0, -180],
    [130, -195],
    [215, -105],
    [200, -40],
    [230, 60],
    [175, 155],
    [80, 205],
    [20, 190],
    [-90, 200],
    [-165, 155],
    [-160, 90],
    [-225, 15],
    [-205, -50],
    [-215, -110],
    [-120, -180],
  ],
  routeWidth: 24,
  terrain: {
    size: 800,
    islands: [
      // Põhjakai (mandri serv) — üks pikk kandiline konteineriterminal
      { x: 0, z: -310, r: 290, h: 3.6, flat: true, w: 570, d: 150 },
      // Idaterminal
      { x: 345, z: 55, r: 150, h: 3.4, flat: true, w: 160, d: 270 },
      // Lõunadokid
      { x: 30, z: 320, r: 180, h: 3.6, flat: true, w: 350, d: 140 },
      // Läänekai
      { x: -335, z: -95, r: 175, h: 3.6, flat: true, w: 140, d: 340 },
      // Keskne terminalisaar, mille ümber rada käib
      { x: 20, z: 20, r: 90, h: 3.2, flat: true, w: 130, d: 115 },
    ],
    noiseScale: 0.008,
    noiseAmp: 1.2,
    baseDepth: 8,
    carveWidth: 40,
  },
  gates: [
    { t: 0.05 },
    { t: 0.12 },
    { t: 0.18, width: 18 },
    { t: 0.24, width: 18 },
    { t: 0.31 },
    { t: 0.38 },
    { t: 0.43, width: 18 },
    { t: 0.49, width: 18 },
    { t: 0.56 },
    { t: 0.63, width: 19 },
    { t: 0.7, width: 18 },
    { t: 0.77, width: 18 },
    { t: 0.85, width: 19 },
    { t: 0.92 },
  ],
  ramps: [
    { t: 0.3, offset: -4, height: 2.2, length: 13 },
    // Kaubalaeva kõrval: boostiga kiire hüppeliin, keskelt saab ohutult mööduda
    { t: 0.455, offset: 5, width: 7.5, height: 3.2, length: 16 },
    { t: 0.74, offset: -4, height: 2.5, length: 14 },
  ],
  boosts: [
    { t: 0.16, offset: 5, radius: 5.5, power: 8 },
    { t: 0.435, offset: 5, radius: 4.5, power: 10 },
    { t: 0.8, offset: 6, radius: 5.5, power: 8 },
  ],
  obstacles: [
    { kind: "palk", t: 0.075, offset: 8 },
    { kind: "kivi", t: 0.2, offset: -9, scale: 1.2 },
    { kind: "palk", t: 0.275, offset: 8 },
    { kind: "kivi", t: 0.485, offset: -9 },
    { kind: "palk", t: 0.58, offset: 9 },
    { kind: "kivi", t: 0.69, offset: -9 },
    { kind: "palk", t: 0.82, offset: 8 },
    { kind: "kivi", t: 0.9, offset: -10, scale: 0.9 },
  ],
  props: [
    // Põhjakai: kraanade rivi + konteineririvid + kaubalaev kai ääres
    { kind: "kraana", x: -180, z: -245, rot: 0 },
    { kind: "kraana", x: -60, z: -245, rot: 0 },
    { kind: "kraana", x: 70, z: -245, rot: 0 },
    { kind: "kraana", x: 190, z: -245, rot: 0 },
    { kind: "konteinerivirn", x: -220, z: -280, rot: 0.05 },
    { kind: "konteinerivirn", x: -110, z: -285, rot: -0.05 },
    { kind: "konteinerivirn", x: 10, z: -280, rot: 0.1 },
    { kind: "konteinerivirn", x: 130, z: -288, rot: 0 },
    { kind: "konteinerivirn", x: 225, z: -278, rot: -0.1 },
    { kind: "ladu", x: -250, z: -330, rot: 0 },
    { kind: "ladu", x: 60, z: -335, rot: 0 },
    { kind: "kaubalaev", x: -20, z: -212, rot: 1.62 },
    // Idaterminal: laod + konteinerid + kraana
    { kind: "ladu", x: 330, z: 10, rot: 1.57 },
    { kind: "ladu", x: 345, z: 105, rot: 1.57 },
    { kind: "konteinerivirn", x: 320, z: 55, rot: 1.5 },
    { kind: "konteinerivirn", x: 375, z: 150, rot: 1.6 },
    { kind: "kraana", x: 290, z: -40, rot: 2.2 },
    { kind: "tuletorn", x: 310, z: 172, scale: 0.9 },
    // Lõunadokid: teine kaubalaev + puitkaid + kraana
    { kind: "kaubalaev", x: 60, z: 228, rot: -1.45 },
    { kind: "kai", x: -120, z: 235, rot: 0 },
    { kind: "kai", x: 150, z: 232, rot: 0 },
    { kind: "kraana", x: 90, z: 270, rot: 3.14 },
    { kind: "konteinerivirn", x: 0, z: 275, rot: 0.08 },
    { kind: "ladu", x: -80, z: 300, rot: 0 },
    // Läänekai: laod + konteinerid + kraana
    { kind: "ladu", x: -335, z: -60, rot: 0 },
    { kind: "konteinerivirn", x: -320, z: 10, rot: -0.1 },
    { kind: "konteinerivirn", x: -335, z: -160, rot: 0.05 },
    { kind: "kraana", x: -300, z: -220, rot: 1.57 },
    { kind: "kai", x: -245, z: -130, rot: 1.57 },
    // Keskne terminalisaar: tihe konteineriväljak kahe kraanaga
    { kind: "kraana", x: 0, z: 45, rot: -1.2 },
    { kind: "kraana", x: 55, z: -15, rot: 2.0 },
    { kind: "konteinerivirn", x: 30, z: 15, rot: 0.5 },
    { kind: "konteinerivirn", x: -15, z: -10, rot: 0.4 },
    // Muulid + navigatsioon
    { kind: "muul", x: -60, z: 120, rot: 1.0 },
    { kind: "majakas", x: -175, z: 20 },
    { kind: "majakas", x: 120, z: -80 },
    // ITK lipud kaidel
    { kind: "lipp", x: -35, z: -250 },
    { kind: "lipp", x: 120, z: -255 },
    { kind: "lipp", x: 340, z: 75 },
    { kind: "lipp", x: -5, z: 285 },
    { kind: "lipp", x: 20, z: 62 },
  ],
  treesPerIsland: 0,
  palette: {
    sand: 0x94918b, // betoonkai serv
    grass: 0x565a5e, // asfalt
    rock: 0x8a8781, // betoonsein
    kunstkate: true,
  },
  allowedWeathers: ["paike", "torm", "udu"],
};
