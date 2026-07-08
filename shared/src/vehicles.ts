import type { VehicleId } from "./types";

export interface VehicleStats {
  id: VehicleId;
  nimi: string;
  tyyp: "paat" | "jett";
  /** m/s */
  topSpeed: number;
  /** m/s² */
  accel: number;
  /** 0..1 — kui kiiresti kiirusvektor kursi poole pöördub (madal = triivib) */
  grip: number;
  /** rooli võimendus */
  rudder: number;
  /** ujuvusvedru jäikus/sumbuvus — jetid jäigemad, põrkavad lainetel */
  buoyStiffness: number;
  buoyDamping: number;
  hullLength: number;
  hullWidth: number;
  /** kollisiooniring (m) */
  hullRadius: number;
  /** suhteline mass — mõjutab põrkekadu */
  mass: number;
  /** kas slide-nupp lõikab gripi (triivimasin) */
  slideBoost: boolean;
  abilityName: string;
  kirjeldus: string;
}

export const VEHICLES: Record<VehicleId, VehicleStats> = {
  kiirpaat: {
    id: "kiirpaat", nimi: "Kiirpaat", tyyp: "paat",
    topSpeed: 30, accel: 8, grip: 0.55, rudder: 1.0,
    buoyStiffness: 22, buoyDamping: 7,
    hullLength: 5.2, hullWidth: 2.0, hullRadius: 2.0, mass: 1.0,
    slideBoost: false,
    abilityName: "Kiil kurvi",
    kirjeldus: "Tasakaalus valik — Shift annab kurvis rohkem haaret",
  },
  kaater: {
    id: "kaater", nimi: "Võidusõidukaater", tyyp: "paat",
    topSpeed: 35, accel: 7, grip: 0.45, rudder: 0.85,
    buoyStiffness: 18, buoyDamping: 6,
    hullLength: 6.4, hullWidth: 2.2, hullRadius: 2.4, mass: 1.3,
    slideBoost: false,
    abilityName: "Kiirustrimm",
    kirjeldus: "Kiireim tippkiirus — Shift sirgel vähendab takistust",
  },
  kalapaat: {
    id: "kalapaat", nimi: "Kalapaat", tyyp: "paat",
    topSpeed: 25, accel: 9.5, grip: 0.75, rudder: 1.15,
    buoyStiffness: 20, buoyDamping: 8,
    hullLength: 4.6, hullWidth: 2.1, hullRadius: 1.9, mass: 1.6,
    slideBoost: false,
    abilityName: "Tugev kere",
    kirjeldus: "Andestav ja vintske — Shift pehmendab põrkeid",
  },
  jett: {
    id: "jett", nimi: "Jett", tyyp: "jett",
    topSpeed: 31, accel: 11, grip: 0.85, rudder: 1.4,
    buoyStiffness: 34, buoyDamping: 7,
    hullLength: 3.0, hullWidth: 1.2, hullRadius: 1.4, mass: 0.7,
    slideBoost: false,
    abilityName: "Lõikepööre",
    kirjeldus: "Väle ja kiire gaasiga — Shift lõikab järsemalt sisse",
  },
  sportjett: {
    id: "sportjett", nimi: "Sportjett", tyyp: "jett",
    topSpeed: 33, accel: 10, grip: 0.7, rudder: 1.3,
    buoyStiffness: 30, buoyDamping: 7,
    hullLength: 3.2, hullWidth: 1.25, hullRadius: 1.4, mass: 0.75,
    slideBoost: true,
    abilityName: "Sügav triiv",
    kirjeldus: "Triivimasin — Shift libistab nüüd veel tuntavamalt",
  },
};

export const VEHICLE_IDS = Object.keys(VEHICLES) as VehicleId[];
