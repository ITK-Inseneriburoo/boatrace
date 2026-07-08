import type { BoatPhysics } from "./BoatPhysics";
import type { Terrain } from "../world/Terrain";

export interface CircleCollider {
  x: number;
  z: number;
  r: number;
  /** pehme takistus (poi) — väiksem põrge */
  soft?: boolean;
}

export interface SegmentCollider {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
}

export interface ColliderSet {
  circles: CircleCollider[];
  segments: SegmentCollider[];
}

export interface CollisionEvent {
  impact: number;
  soft: boolean;
}

interface Capsule {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
}

function boatCapsule(boat: BoatPhysics): Capsule {
  const r = Math.max(boat.stats.hullWidth * 0.48, 0.55);
  const half = Math.max(boat.stats.hullLength / 2 - r, 0);
  return {
    ax: boat.pos.x - boat.forwardX * half,
    az: boat.pos.z - boat.forwardZ * half,
    bx: boat.pos.x + boat.forwardX * half,
    bz: boat.pos.z + boat.forwardZ * half,
    r,
  };
}

function closestOnSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): [number, number] {
  const abx = bx - ax, abz = bz - az;
  const len2 = abx * abx + abz * abz;
  const t = len2 > 0
    ? Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / len2))
    : 0;
  return [ax + abx * t, az + abz * t];
}

function closestSegmentPoints(a: Capsule, s: SegmentCollider): [number, number, number, number] {
  // XZ 2D segment distance. Check endpoints both ways; good enough for short
  // static colliders and avoids solving the full degenerate segment system.
  const candidates: [number, number, number, number, number][] = [];
  for (const [px, pz] of [[a.ax, a.az], [a.bx, a.bz]] as [number, number][]) {
    const [cx, cz] = closestOnSegment(px, pz, s.ax, s.az, s.bx, s.bz);
    const d2 = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
    candidates.push([d2, px, pz, cx, cz]);
  }
  for (const [px, pz] of [[s.ax, s.az], [s.bx, s.bz]] as [number, number][]) {
    const [cx, cz] = closestOnSegment(px, pz, a.ax, a.az, a.bx, a.bz);
    const d2 = (cx - px) * (cx - px) + (cz - pz) * (cz - pz);
    candidates.push([d2, cx, cz, px, pz]);
  }
  candidates.sort((x, y) => x[0] - y[0]);
  const best = candidates[0];
  return [best[1], best[2], best[3], best[4]];
}

/**
 * Paat = orienteeritud kapsel XZ-tasandil. Lahendab ringid, lõigud ja maastikuseina.
 * Tagastab tugevaima löögi (heli/kaamera jaoks).
 */
export function resolveCollisions(
  boat: BoatPhysics,
  colliders: ColliderSet,
  terrain: Terrain | null,
): CollisionEvent | null {
  const hull = boatCapsule(boat);
  let worst: CollisionEvent | null = null;
  const note = (impact: number, soft: boolean): void => {
    if (impact > 0.5 && (!worst || impact > worst.impact)) worst = { impact, soft };
  };

  for (const c of colliders.circles) {
    const [hx, hz] = closestOnSegment(c.x, c.z, hull.ax, hull.az, hull.bx, hull.bz);
    const dx = hx - c.x;
    const dz = hz - c.z;
    const d = Math.hypot(dx, dz);
    const minD = hull.r + c.r;
    if (d < minD) {
      const fallbackX = boat.pos.x - c.x;
      const fallbackZ = boat.pos.z - c.z;
      const fallbackD = Math.hypot(fallbackX, fallbackZ);
      const nx = d > 1e-4 ? dx / d : fallbackD > 1e-4 ? fallbackX / fallbackD : boat.forwardX;
      const nz = d > 1e-4 ? dz / d : fallbackD > 1e-4 ? fallbackZ / fallbackD : boat.forwardZ;
      const push = minD - d;
      if (c.soft) {
        // Poi: nõks, mitte sein
        boat.pos.x += nx * push * 0.4;
        boat.pos.z += nz * push * 0.4;
        note(1, true);
      } else {
        note(boat.applyImpulse(nx, nz, push), false);
      }
    }
  }

  for (const s of colliders.segments) {
    const [hx, hz, sx, sz] = closestSegmentPoints(hull, s);
    const dx = hx - sx, dz = hz - sz;
    const d = Math.hypot(dx, dz);
    const minD = hull.r + s.r;
    if (d < minD) {
      const [cx, cz] = closestOnSegment(boat.pos.x, boat.pos.z, s.ax, s.az, s.bx, s.bz);
      const fallbackX = boat.pos.x - cx;
      const fallbackZ = boat.pos.z - cz;
      const fallbackD = Math.hypot(fallbackX, fallbackZ);
      const sxn = s.bx - s.ax;
      const szn = s.bz - s.az;
      const sl = Math.hypot(sxn, szn) || 1;
      const nx = d > 1e-4 ? dx / d : fallbackD > 1e-4 ? fallbackX / fallbackD : -szn / sl;
      const nz = d > 1e-4 ? dz / d : fallbackD > 1e-4 ? fallbackZ / fallbackD : sxn / sl;
      note(boat.applyImpulse(nx, nz, minD - d), false);
    }
  }

  // Maastik kui sein: kui kere serva all on maa üle veepiiri
  if (terrain) {
    const h = terrain.getHeight(boat.pos.x, boat.pos.z);
    const ahead = terrain.getHeight(
      hull.bx + boat.forwardX * hull.r,
      hull.bz + boat.forwardZ * hull.r,
    );
    const stern = terrain.getHeight(
      hull.ax - boat.forwardX * hull.r,
      hull.az - boat.forwardZ * hull.r,
    );
    if (h > 0.35 || ahead > 0.35 || stern > 0.35) {
      const [gx, gz] = terrain.getGradient(boat.pos.x, boat.pos.z);
      const g = Math.hypot(gx, gz);
      if (g > 1e-4) {
        const nx = -gx / g, nz = -gz / g; // allamäge = vee poole
        note(boat.applyImpulse(nx, nz, Math.min(Math.max(h, ahead, stern), 1.2) + 0.15, 0.1), false);
      }
    }
  }

  return worst;
}
