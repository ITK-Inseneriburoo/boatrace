import * as THREE from "three";
import { mulberry32 } from "@shared/math";

export interface PlacedObstacle {
  kind: "kivi" | "palk";
  x: number;
  z: number;
  scale: number;
  rot: number;
  /** kollisiooniraadius */
  r: number;
}

/** Kivid ühe InstancedMesh'ina, palgid teisena */
export function buildObstacleMeshes(
  obstacles: PlacedObstacle[],
  seed: number,
): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry32(seed + 4242);

  const rocks = obstacles.filter((o) => o.kind === "kivi");
  const logs = obstacles.filter((o) => o.kind === "palk");

  if (rocks.length) {
    const rockGeo = new THREE.IcosahedronGeometry(1.4, 1);
    // Muljume kivi ebakorrapäraseks
    const pos = rockGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.75 + rnd() * 0.5;
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * (0.55 + rnd() * 0.3), pos.getZ(i) * k);
    }
    rockGeo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.95 });
    const mesh = new THREE.InstancedMesh(rockGeo, mat, rocks.length);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    rocks.forEach((o, i) => {
      dummy.position.set(o.x, 0.15, o.z);
      dummy.rotation.set(0, o.rot, 0);
      dummy.scale.setScalar(o.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, col.setHSL(0.09, 0.06, 0.42 + rnd() * 0.18));
    });
    mesh.castShadow = true;
    g.add(mesh);
  }

  if (logs.length) {
    const logGeo = new THREE.CylinderGeometry(0.32, 0.38, 6, 9);
    logGeo.rotateZ(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b4f33, roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(logGeo, mat, logs.length);
    const dummy = new THREE.Object3D();
    logs.forEach((o, i) => {
      dummy.position.set(o.x, 0.05, o.z);
      dummy.rotation.set(0, o.rot, 0);
      dummy.scale.setScalar(o.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.castShadow = true;
    g.add(mesh);
  }

  return g;
}
