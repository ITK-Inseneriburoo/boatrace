import * as THREE from "three";
import { flagTexture } from "../../core/Brand";

const poleMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.4, metalness: 0.6 });

/**
 * Lipumast lehviva ITK-lipuga. Kangas laineb kergelt (geomeetriline
 * siinuskõverus + aeglane pöörlemine updateFlags-is).
 */
export function buildFlagPole(height = 7): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, height, 8), poleMat);
  pole.position.y = height / 2;
  pole.castShadow = true;
  g.add(pole);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), poleMat);
  knob.position.y = height + 0.08;
  g.add(knob);

  // Kangas: kerge siinuslaine sees
  const W = 2.0, H = 1.25, SEG = 12;
  const geo = new THREE.PlaneGeometry(W, H, SEG, 2);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, Math.sin((x / W) * Math.PI * 2) * 0.09 * (x / W + 0.5));
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const flag = new THREE.Mesh(geo, mat);
  flag.position.set(W / 2 + 0.08, height - H / 2 - 0.15, 0);
  flag.castShadow = true;
  flag.name = "itk-flag";
  g.add(flag);

  void flagTexture().then((tex) => {
    if (tex) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
  });
  return g;
}

/** Kerge tuulelehvitus — kutsu kaadris kõigi lippude group'ile */
export function updateFlags(root: THREE.Object3D, time: number): void {
  root.traverse((o) => {
    if (o.name === "itk-flag") {
      o.rotation.y = Math.sin(time * 0.7 + o.id) * 0.18;
    }
  });
}
