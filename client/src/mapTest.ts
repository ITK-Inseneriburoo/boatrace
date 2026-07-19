// Arendusaegne testleht: raja ülaltvaade (/map-test.html?track=sadamalinn&h=500&tilt=0.9)
import * as THREE from "three";
import { getTrack } from "@shared/tracks";
import type { TrackId } from "@shared/types";
import { TrackWorld } from "./world/TrackBuilder";

const params = new URLSearchParams(location.search);
const trackId = (params.get("track") ?? "sadamalinn") as TrackId;
const camH = parseFloat(params.get("h") ?? "520");
const tilt = parseFloat(params.get("tilt") ?? "0.001"); // 0 = otse ülalt, 1 = viltu

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfd4e2);

scene.add(new THREE.HemisphereLight(0xcfe5f5, 0x33454f, 1.1));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(200, 300, 100);
scene.add(sun);

const def = getTrack(trackId);
const world = new TrackWorld(def);
scene.add(world.group);
// Debug-juurdepääs headless-kontrollidele
(window as unknown as Record<string, unknown>).__world = world;
(window as unknown as Record<string, unknown>).__THREE = THREE;

// Lihtne veetasapind (ilma Gerstnerita — ülevaateks piisab)
const sea = new THREE.Mesh(
  new THREE.PlaneGeometry(def.terrain.size * 1.5, def.terrain.size * 1.5),
  new THREE.MeshStandardMaterial({
    color: 0x2e6285,
    transparent: true,
    opacity: 0.82,
    roughness: 0.35,
  }),
);
sea.rotation.x = -Math.PI / 2;
scene.add(sea);

const camera = new THREE.PerspectiveCamera(
  50,
  innerWidth / innerHeight,
  1,
  4000,
);
// Valikuline lähivaade: ?cx&cy&cz = kaamera, ?tx&ty&tz = sihtpunkt
const num = (k: string, def: number): number => {
  const v = params.get(k);
  return v === null ? def : parseFloat(v);
};
camera.position.set(num("cx", 0), num("cy", camH), num("cz", camH * tilt));
camera.lookAt(num("tx", 0), num("ty", 0), num("tz", 0));

function frame(): void {
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
