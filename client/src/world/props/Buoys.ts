import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { WaveSet } from "@shared/waves";
import { getWaveHeight } from "@shared/waves";

export interface BuoyInstance {
  x: number;
  z: number;
  /** juhuslik faasinihe õõtsumisele */
  phase: number;
  /** väravaindeks, mille juurde kuulub (esiletõsteks), -1 = muu */
  gateIndex: number;
}

function buoyGeometry(): THREE.BufferGeometry {
  const base = new THREE.CylinderGeometry(0.55, 0.65, 0.55, 10);
  base.translate(0, 0.28, 0);
  const cone = new THREE.ConeGeometry(0.42, 1.25, 10);
  cone.translate(0, 1.15, 0);
  const top = new THREE.SphereGeometry(0.13, 8, 6);
  top.translate(0, 1.85, 0);
  return mergeGeometries([base, cone, top]);
}

/**
 * Kõik ühte värvi poid ühe InstancedMesh'ina; õõtsuvad lainetel.
 * Järgmise värava poid helendavad (instance-värv).
 */
export class BuoyField {
  readonly mesh: THREE.InstancedMesh;
  private baseColor: THREE.Color;
  private brightColor: THREE.Color;
  private dummy = new THREE.Object3D();

  constructor(
    public instances: BuoyInstance[],
    color: number,
    bright: number,
  ) {
    this.baseColor = new THREE.Color(color);
    this.brightColor = new THREE.Color(bright);
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.5,
      metalness: 0.05,
      color: 0xffffff,
    });
    this.mesh = new THREE.InstancedMesh(buoyGeometry(), mat, Math.max(instances.length, 1));
    this.mesh.castShadow = true;
    for (let i = 0; i < instances.length; i++) {
      this.mesh.setColorAt(i, this.baseColor);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(waves: WaveSet, time: number, highlightGate: number): void {
    for (let i = 0; i < this.instances.length; i++) {
      const b = this.instances[i];
      const y = getWaveHeight(waves, b.x, b.z, time);
      this.dummy.position.set(b.x, y - 0.15, b.z);
      this.dummy.rotation.set(
        Math.sin(time * 1.1 + b.phase) * 0.09,
        b.phase,
        Math.cos(time * 0.9 + b.phase * 2) * 0.09,
      );
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);

      const isNext = b.gateIndex >= 0 && b.gateIndex === highlightGate;
      const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 0;
      this.mesh.setColorAt(
        i,
        isNext ? this.brightColor.clone().lerp(this.baseColor, 1 - pulse) : this.baseColor,
      );
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
