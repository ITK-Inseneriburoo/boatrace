import * as THREE from "three";
import type { WaveSet } from "@shared/waves";
import { getWaveHeight } from "@shared/waves";
import { clamp } from "@shared/math";
import { ParticlePool } from "./Particles";

interface BoatLike {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  topSpeed: number;
  airborne: boolean;
  isJet: boolean;
}

/**
 * Veepritsmed: vööripihud kiirusel, maandumispursked, jeti "kukesaba".
 * Üks pool (üks draw call) kõigi paatide peale.
 */
export class Effects {
  readonly group = new THREE.Group();
  private spray = new ParticlePool(2600, 0xeef6f9, -13);
  private accum = new Map<string, number>();

  constructor() {
    this.group.add(this.spray.points);
  }

  update(time: number): void {
    this.spray.update(time);
  }

  /** Kutsu iga kaadri kohta iga paadi jaoks */
  boatSpray(id: string, b: BoatLike, dt: number, waves: WaveSet, time: number): void {
    const ratio = clamp(b.speed / b.topSpeed, 0, 1);
    if (b.airborne || ratio < 0.25) return;

    const rate = ratio * (b.isJet ? 55 : 38); // osakest/s
    let acc = (this.accum.get(id) ?? 0) + rate * dt;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const rx = -fz, rz = fx; // visuaalne parem

    while (acc >= 1) {
      acc -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      // Vööripritse: küljele ja ette
      const bowX = b.x + fx * 1.6;
      const bowZ = b.z + fz * 1.6;
      const wy = getWaveHeight(waves, bowX, bowZ, time);
      this.spray.spawn(
        bowX + rx * side * 0.7,
        wy + 0.15,
        bowZ + rz * side * 0.7,
        (rx * side * (1.6 + Math.random() * 2.2) + fx * b.speed * 0.25) * 1.0,
        1.4 + Math.random() * 1.8 * ratio,
        (rz * side * (1.6 + Math.random() * 2.2) + fz * b.speed * 0.25) * 1.0,
        0.5 + Math.random() * 0.4,
        1.6 + ratio * 2.4,
        time,
      );
    }

    // Jeti kukesaba ahtrist
    if (b.isJet && ratio > 0.55 && Math.random() < ratio * 0.8) {
      const wy = getWaveHeight(waves, b.x, b.z, time);
      this.spray.spawn(
        b.x - fx * 1.6,
        wy + 0.1,
        b.z - fz * 1.6,
        -fx * 3 + (Math.random() - 0.5) * 1.5,
        4.5 + Math.random() * 2.5,
        -fz * 3 + (Math.random() - 0.5) * 1.5,
        0.7 + Math.random() * 0.3,
        2.2 + ratio * 2,
        time,
      );
    }

    this.accum.set(id, acc);
  }

  /** Suur purse maandumisel/kollisioonil */
  burst(x: number, z: number, intensity: number, waves: WaveSet, time: number): void {
    const wy = getWaveHeight(waves, x, z, time);
    const n = Math.round(clamp(intensity, 0.2, 1) * 46);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.2;
      const up = 2.5 + Math.random() * 5 * intensity;
      this.spray.spawn(
        x + Math.cos(a) * r,
        wy + 0.1,
        z + Math.sin(a) * r,
        Math.cos(a) * (1.5 + Math.random() * 3),
        up,
        Math.sin(a) * (1.5 + Math.random() * 3),
        0.6 + Math.random() * 0.5,
        2 + Math.random() * 2.6,
        time,
      );
    }
  }
}
