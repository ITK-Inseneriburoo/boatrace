import * as THREE from "three";
import type { WaveSet } from "@shared/waves";
import { getWaveHeight } from "@shared/waves";
import { clamp, damp, angleDamp } from "@shared/math";
import type { BoatPhysics } from "../sim/BoatPhysics";

const BASE_FOV = 60;
const MAX_FOV = 73;

/**
 * Jälituskaamera: silutud positsioon paadi taga, suund = kursi ja
 * kiirusvektori segu (triivid paistavad küljelt), FOV-kick kiirusel,
 * trauma-põhine värin.
 */
export class ChaseCamera {
  /** 0..1 — lisa põrgetel/maandumistel; kahaneb ise */
  trauma = 0;

  private camYaw = 0;
  private fov = BASE_FOV;
  private pos = new THREE.Vector3(0, 4, -9);
  private lookTarget = new THREE.Vector3();
  private shakeT = 0;

  constructor(private camera: THREE.PerspectiveCamera) {}

  snapTo(boat: BoatPhysics): void {
    this.camYaw = boat.yaw;
    this.pos.set(
      boat.pos.x - Math.sin(boat.yaw) * 9,
      boat.pos.y + 3.5,
      boat.pos.z - Math.cos(boat.yaw) * 9,
    );
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  update(boat: BoatPhysics, waves: WaveSet, time: number, dt: number): void {
    const speedRatio = clamp(boat.speed / boat.stats.topSpeed, 0, 1);

    // Suund: 70% kurss + 30% liikumissuund
    let velYaw = boat.yaw;
    if (boat.speed > 1.5) velYaw = Math.atan2(boat.vel.x, boat.vel.z);
    const targetYaw = boat.yaw + normalizeAngle(velYaw - boat.yaw) * 0.3;
    this.camYaw = angleDamp(this.camYaw, targetYaw, 4.5, dt);

    const dist = 8.2 + speedRatio * 2.4;
    const height = 3.1 + speedRatio * 0.7;
    const tx = boat.pos.x - Math.sin(this.camYaw) * dist;
    const tz = boat.pos.z - Math.cos(this.camYaw) * dist;
    const ty = boat.pos.y + height;

    this.pos.x = damp(this.pos.x, tx, 5, dt);
    this.pos.y = damp(this.pos.y, ty, 4, dt);
    this.pos.z = damp(this.pos.z, tz, 5, dt);

    // Ära kunagi lase kaamerat vee alla
    const waterY = getWaveHeight(waves, this.pos.x, this.pos.z, time);
    if (this.pos.y < waterY + 0.8) this.pos.y = waterY + 0.8;

    // Vaatepunkt paadist ette
    const lookAhead = 3 + speedRatio * 6;
    this.lookTarget.set(
      boat.pos.x + Math.sin(boat.yaw) * lookAhead,
      boat.pos.y + 1.0,
      boat.pos.z + Math.cos(boat.yaw) * lookAhead,
    );

    // FOV-kick
    const targetFov = BASE_FOV + (MAX_FOV - BASE_FOV) * speedRatio * speedRatio;
    this.fov = damp(this.fov, targetFov, 3, dt);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    // Trauma-värin
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.shakeT += dt * 30;
    const sh = this.trauma * this.trauma;

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.lookTarget);
    if (sh > 0.001) {
      this.camera.rotation.x += Math.sin(this.shakeT * 1.3) * 0.05 * sh;
      this.camera.rotation.y += Math.sin(this.shakeT * 1.7 + 4.2) * 0.05 * sh;
      this.camera.rotation.z += Math.sin(this.shakeT * 1.1 + 2.1) * 0.07 * sh;
    }
    // Kerge kaasarullumine
    this.camera.rotation.z += -boat.roll * 0.18;
  }
}

function normalizeAngle(a: number): number {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
