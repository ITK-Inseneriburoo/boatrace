import * as THREE from "three";
import type { TrackId, VehicleId } from "@shared/types";
import { angleLerp, lerp } from "@shared/math";
import { buildBoatModel } from "../boats/BoatFactory";
import type { BoatPhysics } from "./BoatPhysics";

/** Üks salvestuspunkt: [aeg s, x, y, z, yaw, pitch, roll] */
type Sample = [number, number, number, number, number, number, number];

interface GhostData {
  vehicle: VehicleId;
  lapMs: number;
  samples: Sample[];
}

const SAMPLE_HZ = 15;

function key(trackId: TrackId): string {
  return `boatrace.ghost.${trackId}`;
}

export function loadGhostData(trackId: TrackId): GhostData | null {
  try {
    const raw = localStorage.getItem(key(trackId));
    if (!raw) return null;
    const d = JSON.parse(raw) as GhostData;
    if (!Array.isArray(d.samples) || d.samples.length < 4) return null;
    return d;
  } catch {
    return null;
  }
}

/**
 * Salvestab jooksva ringi trajektoori (15Hz). Ringi lõpus, kui see oli
 * senisest parim ja puhas (ilma respawnita), salvestatakse localStorage'i.
 */
export class GhostRecorder {
  private samples: Sample[] = [];
  private accum = 0;
  private lapTime = 0;
  private dirty = false;

  constructor(
    private trackId: TrackId,
    private vehicle: VehicleId,
  ) {}

  startLap(): void {
    this.samples = [];
    this.accum = 0;
    this.lapTime = 0;
    this.dirty = false;
  }

  /** Respawn rikub ringi — seda ei salvestata */
  markDirty(): void {
    this.dirty = true;
  }

  record(p: BoatPhysics, dt: number): void {
    this.lapTime += dt;
    this.accum += dt;
    if (this.accum < 1 / SAMPLE_HZ) return;
    this.accum %= 1 / SAMPLE_HZ;
    const r2 = (x: number): number => Math.round(x * 100) / 100;
    const r3 = (x: number): number => Math.round(x * 1000) / 1000;
    this.samples.push([
      Math.round(this.lapTime * 1000) / 1000,
      r2(p.pos.x), r2(p.pos.y), r2(p.pos.z),
      r3(p.yaw), r3(p.pitch), r3(p.roll),
    ]);
    // Kaitse: üle 5 min ringi ei salvesta
    if (this.samples.length > SAMPLE_HZ * 300) this.dirty = true;
  }

  /** Ringi lõpp → salvesta kui parim. Tagastab true, kui uus rekord. */
  finishLap(lapMs: number): boolean {
    const wasDirty = this.dirty;
    const samples = this.samples;
    this.startLap();
    if (wasDirty || samples.length < 4) return false;
    const existing = loadGhostData(this.trackId);
    if (existing && existing.lapMs <= lapMs) return false;
    try {
      localStorage.setItem(
        key(this.trackId),
        JSON.stringify({ vehicle: this.vehicle, lapMs, samples } satisfies GhostData),
      );
      return true;
    } catch {
      return false; // localStorage täis vms
    }
  }
}

/** Poolläbipaistev kummituspaat, mis mängib parima ringi salvestust */
export class GhostBoat {
  readonly mesh: THREE.Group;
  readonly lapMs: number;
  private samples: Sample[];

  constructor(data: GhostData) {
    this.samples = data.samples;
    this.lapMs = data.lapMs;
    this.mesh = buildBoatModel(data.vehicle, 0xbfd4de);
    // NB: GLB asendus toimub asünkroonselt — muuda läbipaistvaks viitega
    setTimeout(() => this.makeTranslucent(), 1500);
    this.makeTranslucent();
  }

  private makeTranslucent(): void {
    this.mesh.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          m.transparent = true;
          m.opacity = 0.35;
          m.depthWrite = false;
        }
        o.castShadow = false;
      }
    });
  }

  /** @param lapElapsed aeg ringi algusest (s) */
  update(lapElapsed: number): void {
    const s = this.samples;
    const t = lapElapsed % Math.max(this.lapMs / 1000, 0.001);
    // Binaarotsing oleks kiirem, aga ~2000 punkti lineaarne otsing algusest
    // oleks kallis — hoia kursorit? Lihtne: binaarotsing.
    let lo = 0, hi = s.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid][0] <= t) lo = mid;
      else hi = mid;
    }
    const a = s[lo], b = s[Math.min(lo + 1, s.length - 1)];
    const k = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
    this.mesh.position.set(
      lerp(a[1], b[1], k),
      lerp(a[2], b[2], k),
      lerp(a[3], b[3], k),
    );
    this.mesh.rotation.set(
      -lerp(a[5], b[5], k),
      angleLerp(a[4], b[4], k),
      -lerp(a[6], b[6], k),
      "YXZ",
    );
  }

  dispose(): void {
    this.mesh.removeFromParent();
  }
}
