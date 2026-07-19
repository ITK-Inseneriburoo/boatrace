import type { TrackId, WeatherId } from "../types";

/** Saare kühm maastiku kõrguskaardil */
export interface IslandDef {
  x: number;
  z: number;
  /** raadius (m) */
  r: number;
  /** tipu kõrgus (m) */
  h: number;
  /** lame platvorm (betoonkai) järsu seinaga ümara künka asemel */
  flat?: boolean;
  /** ristkülikukujulise platvormi laius x-suunas (m); koos d-ga teeb lameda saare kandiliseks */
  w?: number;
  /** ristkülikukujulise platvormi pikkus z-suunas (m) */
  d?: number;
  /** ristküliku pööre radiaanides ümber Y */
  rot?: number;
}

export interface GateDef {
  /** parameeter piki suletud rajasplaini [0,1) */
  t: number;
  /** värava laius (m), vaikimisi 22 */
  width?: number;
}

export interface RampDef {
  t: number;
  /** külgnihe splaini normaali suunas (m) */
  offset: number;
  width?: number;
  length?: number;
  height?: number;
}

export interface BoostDef {
  t: number;
  /** külgnihe splaini normaali suunas (m) */
  offset: number;
  radius?: number;
  /** lisakiirus m/s sõidusuunas */
  power?: number;
}

export type ObstacleKind = "kivi" | "palk";

export interface ObstacleDef {
  kind: ObstacleKind;
  t: number;
  offset: number;
  scale?: number;
}

/** Staatilised ehitised/dekoratsioonid */
export type PropKind =
  | "kai" // puitkai vaiadel
  | "muul" // kivimuul (murdlaine-tõke)
  | "kraana" // portaalkraana
  | "konteinerivirn"
  | "kaubalaev"
  | "ladu" // laohoone
  | "majakas"
  | "tuletorn"
  | "lipp"; // ITK lipumast

export interface PropDef {
  kind: PropKind;
  x: number;
  z: number;
  /** pööre radiaanides ümber Y */
  rot?: number;
  scale?: number;
}

export interface TrackDef {
  id: TrackId;
  nimi: string;
  kirjeldus: string;
  defaultLaps: number;
  seed: number;
  /** Suurenda, kui raja geomeetria muutub ja vanad ghost'id enam ei sobi. */
  ghostVersion?: number;
  /** suletud Catmull-Rom splaini kontrollpunktid [x,z] */
  route: [number, number][];
  /** sõidukanali laius (m) — süvendatakse alati veeks */
  routeWidth: number;
  terrain: {
    /** maastiku külje pikkus (m), keskpunkt (0,0) */
    size: number;
    islands: IslandDef[];
    noiseScale: number;
    noiseAmp: number;
    /** meresügavus saartest eemal (m, positiivne) */
    baseDepth: number;
    /** kanali süvenduse laius splaini ümber */
    carveWidth: number;
  };
  gates: GateDef[];
  ramps: RampDef[];
  boosts?: BoostDef[];
  obstacles: ObstacleDef[];
  props: PropDef[];
  /** puude tihedus saartel (0 = pole) */
  treesPerIsland: number;
  /** hoovuse tugevus piki rada (m/s², jõekanjonile) */
  current?: number;
  /** maastiku värvipalett (vaikimisi liiv/rohi/kalju) */
  palette?: {
    sand: number;
    grass: number;
    rock: number;
    /** sellest kõrgusest ülespoole lumi */
    snowAbove?: number;
    /** true = tehiskate (asfalt/betoon): loodustekstuuride splat jääb ära */
    kunstkate?: boolean;
  };
  allowedWeathers: WeatherId[];
}
