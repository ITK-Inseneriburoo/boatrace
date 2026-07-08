import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
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

function buildRockGeometry(rnd: () => number): THREE.BufferGeometry {
  // IcosahedronGeometry võib hoida servatippe tahkude kaupa dubleerituna.
  // Merge enne muljumist hoiab kivi ühe tervikliku massina, mitte "lehtedena".
  const geo = mergeVertices(new THREE.IcosahedronGeometry(1.35, 2), 1e-4);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const radial = 0.78 + rnd() * 0.34;
    const squat = 0.46 + rnd() * 0.22;
    const shoulder = y > 0 ? 0.86 + rnd() * 0.2 : 1;
    pos.setXYZ(
      i,
      x * radial * shoulder,
      Math.max(y * squat - 0.12, -0.52),
      z * (0.82 + rnd() * 0.28) * shoulder,
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
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
    const rockGeo = buildRockGeometry(rnd);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a8578,
      roughness: 0.95,
      flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(rockGeo, mat, rocks.length);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    rocks.forEach((o, i) => {
      dummy.position.set(o.x, 0.15, o.z);
      dummy.rotation.set(0, o.rot, 0);
      dummy.scale.set(
        o.scale * (0.9 + rnd() * 0.22),
        o.scale * (0.82 + rnd() * 0.16),
        o.scale * (0.9 + rnd() * 0.22),
      );
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
