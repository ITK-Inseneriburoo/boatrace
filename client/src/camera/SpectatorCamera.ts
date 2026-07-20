import * as THREE from "three";
import { clamp, damp, angleDamp } from "@shared/math";
import type { Input } from "../core/Input";

export interface SpectatorTarget {
  x: number;
  z: number;
  yaw: number;
  name?: string;
}

/**
 * Vaatleja kaamera:
 *  - vaba pealtvaade: WASD/nooled liigutavad, Q/E muudavad kõrgust
 *  - Tab tsükleerib: vaba vaade → järgne paadile 1 → paadile 2 → … → vaba
 */
export class SpectatorCamera {
  /** -1 = vaba pealtvaade, >=0 = järgnetava võistleja indeks */
  followIndex = -1;

  private x = 0;
  private z = 0;
  private height = 130;
  private camYaw = 0;

  constructor(private camera: THREE.PerspectiveCamera) {}

  reset(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.height = 130;
    this.followIndex = -1;
  }

  /** Tab vajutati — järgmine vaatepunkt */
  cycle(targetCount: number): void {
    this.followIndex++;
    if (this.followIndex >= targetCount) this.followIndex = -1;
  }

  update(input: Input, targets: SpectatorTarget[], dt: number): void {
    if (this.followIndex >= 0 && this.followIndex < targets.length) {
      // Järgne paadile (lihtne jälituskaamera)
      const t = targets[this.followIndex];
      this.camYaw = angleDamp(this.camYaw, t.yaw, 4, dt);
      const dist = 11;
      const tx = t.x - Math.sin(this.camYaw) * dist;
      const tz = t.z - Math.cos(this.camYaw) * dist;
      this.x = damp(this.x, tx, 6, dt);
      this.z = damp(this.z, tz, 6, dt);
      this.height = damp(this.height, 4.5, 5, dt);
      this.camera.position.set(this.x, this.height, this.z);
      this.camera.lookAt(t.x, 1, t.z);
    } else {
      // Vaba pealtvaade: liikumiskiirus kasvab kõrgusega
      const speed = 0.55 * this.height + 12;
      let mx = 0, mz = 0;
      if (input.isDown("KeyW") || input.isDown("ArrowUp")) mz -= 1;
      if (input.isDown("KeyS") || input.isDown("ArrowDown")) mz += 1;
      if (input.isDown("KeyA") || input.isDown("ArrowLeft")) mx -= 1;
      if (input.isDown("KeyD") || input.isDown("ArrowRight")) mx += 1;
      if (Math.abs(input.gamepadMoveX) > Math.abs(mx)) mx = input.gamepadMoveX;
      if (Math.abs(input.gamepadMoveY) > Math.abs(mz)) mz = input.gamepadMoveY;
      // Digitaalne diagonaal normaliseerub, analoogkepi väiksem kalle säilitab tundlikkuse.
      const len = Math.max(1, Math.hypot(mx, mz));
      this.x += (mx / len) * speed * dt;
      this.z += (mz / len) * speed * dt;
      if (input.isDown("KeyQ")) this.height *= 1 + 1.4 * dt;
      if (input.isDown("KeyE")) this.height *= 1 - 1.4 * dt;
      this.height *= 1 - input.gamepadLookY * 1.4 * dt;
      this.height = clamp(this.height, 18, 420);

      // Kerge kalle: kaamera veidi lõuna pool, vaatab põhja poole alla
      this.camera.position.set(this.x, this.height, this.z + this.height * 0.42);
      this.camera.lookAt(this.x, 0, this.z);
    }
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
  }
}
