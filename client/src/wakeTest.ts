// Arendusaegne test: kiiluvee-RT sisu otse ekraanil (/wake-test.html)
import * as THREE from "three";
import { WakeSystem } from "./world/WakeSystem";

const renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const wake = new WakeSystem(400);

const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
const quad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshBasicMaterial({ map: wake.texture }),
);
scene.add(quad);

let t = 0;
function frame(): void {
  t += 0.016;
  // Paat sõidab ringjoonel raadiusega 120
  const x = Math.cos(t * 0.5) * 120;
  const z = Math.sin(t * 0.5) * 120;
  const yaw = Math.atan2(
    Math.cos(t * 0.5) * 0.5 * 120,
    -Math.sin(t * 0.5) * 0.5 * 120,
  );
  wake.begin();
  wake.stamp(x, z, yaw, 0.9);
  wake.render(renderer);
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
frame();
