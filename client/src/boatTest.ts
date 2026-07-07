// Arendusaegne testleht: kõik 5 sõidukit ühes kaadris (/boat-test.html)
import * as THREE from "three";
import { VEHICLE_IDS } from "@shared/vehicles";
import { buildBoatModel } from "./boats/BoatFactory";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8899aa);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);

scene.add(new THREE.HemisphereLight(0xcfe5f5, 0x33454f, 1.2));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.5);
sun.position.set(5, 8, 3);
scene.add(sun);
const grid = new THREE.GridHelper(40, 40, 0x666666, 0x556066);
scene.add(grid);

const colors = [0xe63946, 0xf4a261, 0x2a9d8f, 0x4895ef, 0x9b5de5];
const models: THREE.Group[] = [];
VEHICLE_IDS.forEach((id, i) => {
  const m = buildBoatModel(id, colors[i]);
  m.position.set((i - 2) * 4.5, 0.3, 0);
  scene.add(m);
  models.push(m);
});


// Ramp orientatsiooni kontrolliks (eemal paatidest)
import("./world/props/Ramp").then(({ buildRampMesh }) => {
  const ramp = buildRampMesh({
    x: 0, z: 9, dirX: 0, dirZ: 1, width: 7, length: 13, height: 2.2,
  });
  scene.add(ramp);
});

let angle = 0.5;
const params = new URLSearchParams(location.search);
const fixedAngle = params.get("angle");
if (fixedAngle) angle = parseFloat(fixedAngle);

function frame(): void {
  camera.position.set(Math.sin(angle) * 14, 5.5, Math.cos(angle) * 14);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
