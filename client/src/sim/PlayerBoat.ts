import * as THREE from "three";
import type { VehicleId } from "@shared/types";
import { VEHICLES } from "@shared/vehicles";
import type { WaveSet } from "@shared/waves";
import { angleLerp, lerp } from "@shared/math";
import { BoatPhysics, type BoatInput } from "./BoatPhysics";
import { buildBoatModel } from "../boats/BoatFactory";

/**
 * Kohaliku mängija paat: sisend → füüsika → visuaal.
 * Renderdus interpoleerib kahe füüsikasammu vahel (alpha).
 */
export class PlayerBoat {
  readonly physics: BoatPhysics;
  readonly mesh: THREE.Group;

  private prevPos = new THREE.Vector3();
  private prevYaw = 0;
  private prevPitch = 0;
  private prevRoll = 0;

  constructor(public vehicleId: VehicleId, accentColor: number) {
    this.physics = new BoatPhysics(VEHICLES[vehicleId]);
    this.mesh = buildBoatModel(vehicleId, accentColor);
  }

  snapshot(): void {
    this.prevPos.copy(this.physics.pos);
    this.prevYaw = this.physics.yaw;
    this.prevPitch = this.physics.pitch;
    this.prevRoll = this.physics.roll;
  }

  /** Lukusta mõlemad interpolatsioonipoosid füüsika hetkeseisu. */
  freezeVisual(): void {
    this.snapshot();
    this.applyVisual(1);
  }

  update(input: BoatInput, waves: WaveSet, time: number, dt: number): void {
    this.snapshot();
    this.physics.step(input, waves, time, dt);
  }

  /** Sea mesh interpoleeritud poosi (kutsu renderis) */
  applyVisual(alpha: number): void {
    const p = this.physics;
    this.mesh.position.set(
      lerp(this.prevPos.x, p.pos.x, alpha),
      lerp(this.prevPos.y, p.pos.y, alpha),
      lerp(this.prevPos.z, p.pos.z, alpha),
    );
    const yaw = angleLerp(this.prevYaw, p.yaw, alpha);
    const pitch = lerp(this.prevPitch, p.pitch, alpha);
    const roll = lerp(this.prevRoll, p.roll, alpha);
    this.mesh.rotation.set(-pitch, yaw, -roll, "YXZ");
  }
}
