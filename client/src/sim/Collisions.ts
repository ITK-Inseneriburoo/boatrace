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

/**
 * Paat = ring XZ-tasandil. Lahendab ringid, lõigud ja maastikuseina.
 * Tagastab tugevaima löögi (heli/kaamera jaoks).
 */
export function resolveCollisions(
  boat: BoatPhysics,
  colliders: ColliderSet,
  terrain: Terrain | null,
): CollisionEvent | null {
  const br = boat.stats.hullRadius;
  let worst: CollisionEvent | null = null;
  const note = (impact: number, soft: boolean): void => {
    if (impact > 0.5 && (!worst || impact > worst.impact)) worst = { impact, soft };
  };

  for (const c of colliders.circles) {
    const dx = boat.pos.x - c.x;
    const dz = boat.pos.z - c.z;
    const d = Math.hypot(dx, dz);
    const minD = br + c.r;
    if (d < minD && d > 1e-4) {
      const nx = dx / d, nz = dz / d;
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
    const abx = s.bx - s.ax, abz = s.bz - s.az;
    const len2 = abx * abx + abz * abz;
    const t = len2 > 0
      ? Math.max(0, Math.min(1, ((boat.pos.x - s.ax) * abx + (boat.pos.z - s.az) * abz) / len2))
      : 0;
    const cx = s.ax + abx * t, cz = s.az + abz * t;
    const dx = boat.pos.x - cx, dz = boat.pos.z - cz;
    const d = Math.hypot(dx, dz);
    const minD = br + s.r;
    if (d < minD && d > 1e-4) {
      note(boat.applyImpulse(dx / d, dz / d, minD - d), false);
    }
  }

  // Maastik kui sein: kui kere serva all on maa üle veepiiri
  if (terrain) {
    const h = terrain.getHeight(boat.pos.x, boat.pos.z);
    const ahead = terrain.getHeight(
      boat.pos.x + boat.forwardX * br,
      boat.pos.z + boat.forwardZ * br,
    );
    if (h > 0.35 || ahead > 0.35) {
      const [gx, gz] = terrain.getGradient(boat.pos.x, boat.pos.z);
      const g = Math.hypot(gx, gz);
      if (g > 1e-4) {
        const nx = -gx / g, nz = -gz / g; // allamäge = vee poole
        note(boat.applyImpulse(nx, nz, Math.min(Math.max(h, ahead), 1.2) + 0.15, 0.1), false);
      }
    }
  }

  return worst;
}
