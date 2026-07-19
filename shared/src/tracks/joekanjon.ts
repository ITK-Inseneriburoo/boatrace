import type { TrackDef } from "./types";

/**
 * Jõekanjon — kahe silmusega kaheksakujuline kanal kõrgete kaljuseinte vahel.
 * Rajaharud ristuvad keskmassiivis samal veetasemel; hoovus, nihkes väravad
 * ja vastutulevad paadid nõuavad ristmikule lähenedes teadlikku sõiduliini.
 */
export const joekanjon: TrackDef = {
  id: "joekanjon",
  nimi: "Jõekanjon",
  kirjeldus: "Kaheksakujuline kanjon, ristuv rada ja kiire hoovus",
  defaultLaps: 2,
  seed: 4242,
  ghostVersion: 3,
  route: [
    // Vasaku silmuse ülemine kaar → esimene keskristumine
    [-350, -40],
    [-300, 105],
    [-170, 150],
    [-55, 105],
    [0, 0],
    // Parema silmuse alumine ja ülemine kaar
    [55, -105],
    [170, -150],
    [300, -105],
    [350, 40],
    [300, 145],
    [170, 165],
    [55, 110],
    // Teine keskristumine → vasaku silmuse alumine kaar
    [0, 0],
    [-55, -110],
    [-170, -165],
    [-300, -145],
  ],
  routeWidth: 20,
  terrain: {
    size: 1000,
    islands: [
      // Keskmassiiv
      { x: 0, z: 0, r: 175, h: 24 },
      { x: -160, z: 30, r: 90, h: 18 },
      { x: 170, z: -20, r: 95, h: 20 },
      // Välisring — kanjoni välisseinad
      { x: -390, z: -220, r: 130, h: 22 },
      { x: -80, z: -290, r: 150, h: 19 },
      { x: 240, z: -300, r: 130, h: 22 },
      { x: 450, z: -60, r: 120, h: 20 },
      { x: 400, z: 230, r: 130, h: 22 },
      { x: 80, z: 290, r: 140, h: 20 },
      { x: -260, z: 300, r: 125, h: 21 },
      { x: -460, z: 100, r: 110, h: 18 },
    ],
    noiseScale: 0.014,
    noiseAmp: 15,
    baseDepth: 7,
    carveWidth: 34,
  },
  gates: [
    // Ristumised jäävad väravapaaride 0.22/0.29 ja 0.71/0.78 vahele.
    { t: 0.05, offset: -3, width: 17 },
    { t: 0.11, offset: 3, width: 16 },
    { t: 0.17, offset: -4, width: 15 },
    { t: 0.22, offset: 3, width: 16 },
    { t: 0.29, offset: -3, width: 16 },
    { t: 0.36, offset: 4, width: 15 },
    { t: 0.43, offset: -4, width: 16 },
    { t: 0.5, offset: 3, width: 17 },
    { t: 0.57, offset: -3, width: 16 },
    { t: 0.64, offset: 4, width: 15 },
    { t: 0.71, offset: -4, width: 16 },
    { t: 0.78, offset: 3, width: 16 },
    { t: 0.84, offset: -3, width: 15 },
    { t: 0.91, offset: 3, width: 16 },
    { t: 0.96, offset: -3, width: 17 },
  ],
  ramps: [
    { t: 0.14, offset: 0, height: 2.4, length: 14 },
    { t: 0.34, offset: -3, height: 2.6, length: 15 },
    { t: 0.59, offset: 3, height: 2.2, length: 13 },
    { t: 0.9, offset: 4, height: 2.5, length: 14 },
  ],
  boosts: [
    { t: 0.2, offset: -4, radius: 5, power: 8 },
    { t: 0.47, offset: 5, radius: 5, power: 8 },
    { t: 0.69, offset: -5, radius: 5, power: 8 },
    { t: 0.94, offset: 4, radius: 5, power: 8 },
  ],
  obstacles: [
    { kind: "kivi", t: 0.03, offset: -8, scale: 1.4 },
    { kind: "kivi", t: 0.08, offset: 9 },
    { kind: "palk", t: 0.18, offset: -1, scale: 1.05 },
    { kind: "kivi", t: 0.2, offset: 7, scale: 1.6 },
    { kind: "kivi", t: 0.28, offset: -9, scale: 1.1 },
    { kind: "kivi", t: 0.4, offset: -7, scale: 1.3 },
    { kind: "kivi", t: 0.47, offset: 9, scale: 0.9 },
    { kind: "palk", t: 0.54, offset: -1, scale: 1.05 },
    { kind: "kivi", t: 0.65, offset: 6, scale: 1.5 },
    { kind: "kivi", t: 0.68, offset: -6 },
    { kind: "palk", t: 0.76, offset: 1, scale: 1.05 },
    { kind: "kivi", t: 0.82, offset: -9, scale: 1.2 },
    { kind: "kivi", t: 0.95, offset: 7, scale: 1.4 },
  ],
  props: [
    { kind: "majakas", x: -352, z: -100 },
    { kind: "majakas", x: 355, z: 15 },
    { kind: "majakas", x: -60, z: 190 },
  ],
  treesPerIsland: 18,
  current: 1.1,
  allowedWeathers: ["paike", "torm", "udu"],
};
