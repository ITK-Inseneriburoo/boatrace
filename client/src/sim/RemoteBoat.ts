import * as THREE from "three";
import type { StatePayload } from "@shared/protocol";
import type { VehicleId } from "@shared/types";
import { INTERP_DELAY_MS, MAX_EXTRAPOLATION_MS } from "@shared/constants";
import { angleLerp, lerp } from "@shared/math";
import { buildBoatModel } from "../boats/BoatFactory";

interface Snapshot {
  t: number;
  p: [number, number, number];
  r: [number, number, number];
  v: [number, number];
  s: number;
}

/**
 * Kaugmängija paat: snapshot-puhver + renderdus INTERP_DELAY_MS minevikus.
 * Puuduvate snapshotide korral ekstrapoleerib kuni MAX_EXTRAPOLATION_MS,
 * seejärel külmub ja muutub kummituseks (poolläbipaistev).
 */
export class RemoteBoat {
  readonly mesh: THREE.Group;
  /** viimane teadaolev kiirus m/s (heli/efektide jaoks) */
  speed = 0;
  x = 0;
  z = 0;
  yaw = 0;

  private buffer: Snapshot[] = [];
  private ghost = false;
  private materials: THREE.Material[] = [];

  constructor(
    public readonly playerId: string,
    public readonly vehicle: VehicleId,
    color: number,
  ) {
    this.mesh = buildBoatModel(vehicle, color);
    this.mesh.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        this.materials.push(...mats);
      }
    });
  }

  push(st: number, payload: StatePayload): void {
    // Hoia puhver ajalises järjekorras; viska liiga vanad ära
    this.buffer.push({ t: st, p: payload.p, r: payload.r, v: payload.v, s: payload.s });
    if (this.buffer.length > 40) this.buffer.splice(0, this.buffer.length - 40);
  }

  /** @param serverNow serveri kellaaeg praegu (NetClient.serverNow()) */
  update(serverNow: number): void {
    const renderTime = serverNow - INTERP_DELAY_MS;
    const buf = this.buffer;
    if (buf.length === 0) return;

    let a: Snapshot | null = null;
    let b: Snapshot | null = null;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].t <= renderTime) {
        a = buf[i];
        b = buf[i + 1] ?? null;
        break;
      }
    }

    let p: [number, number, number];
    let r: [number, number, number];
    let stale = false;

    if (a && b) {
      const k = (renderTime - a.t) / Math.max(b.t - a.t, 1);
      p = [lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k)];
      r = [
        angleLerp(a.r[0], b.r[0], k),
        angleLerp(a.r[1], b.r[1], k),
        angleLerp(a.r[2], b.r[2], k),
      ];
      this.speed = lerp(a.s, b.s, k);
    } else if (a) {
      // Uusim snapshot on minevikus → ekstrapoleeri veidi
      const over = Math.min(renderTime - a.t, MAX_EXTRAPOLATION_MS);
      const dt = over / 1000;
      p = [a.p[0] + a.v[0] * dt, a.p[1], a.p[2] + a.v[1] * dt];
      r = a.r;
      this.speed = a.s;
      stale = renderTime - a.t > MAX_EXTRAPOLATION_MS + 1500;
    } else {
      // Kõik snapshotid tulevikus (just liitusime) — võta esimene
      p = buf[0].p;
      r = buf[0].r;
      this.speed = buf[0].s;
    }

    this.mesh.position.set(p[0], p[1], p[2]);
    this.mesh.rotation.set(-r[1], r[0], -r[2], "YXZ");
    this.x = p[0];
    this.z = p[2];
    this.yaw = r[0];
    this.setGhost(stale);
  }

  private setGhost(on: boolean): void {
    if (on === this.ghost) return;
    this.ghost = on;
    for (const m of this.materials) {
      m.transparent = on;
      m.opacity = on ? 0.35 : 1;
      m.needsUpdate = true;
    }
  }

  dispose(): void {
    this.mesh.removeFromParent();
  }
}
