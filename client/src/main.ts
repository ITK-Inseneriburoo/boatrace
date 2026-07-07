import * as THREE from "three";
import { Engine } from "./core/Engine";
import { Input } from "./core/Input";
import { Ocean } from "./world/Ocean";
import { SkySystem } from "./world/SkySystem";
import { WEATHERS, type WeatherPreset } from "./world/WeatherPresets";
import { PlayerBoat } from "./sim/PlayerBoat";
import { ChaseCamera } from "./camera/ChaseCamera";
import { TrackWorld } from "./world/TrackBuilder";
import { RaceLogic } from "./sim/RaceLogic";
import { resolveCollisions } from "./sim/Collisions";
import { getTrack } from "@shared/tracks";
import { getWaveHeight } from "@shared/waves";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const engine = new Engine(canvas);
const input = new Input();

const sky = new SkySystem(engine);
const ocean = new Ocean();
engine.scene.add(ocean.group);

// --- Rada ---
const track = new TrackWorld(getTrack("saarestik"));
engine.scene.add(track.group);
ocean.setDepthTexture(
  track.terrain.depthTexture,
  -track.terrain.size / 2,
  -track.terrain.size / 2,
  track.terrain.size,
  track.terrain.size,
  1,
  0,
);

let weather = WEATHERS.paike;
function applyWeather(w: WeatherPreset): void {
  weather = w;
  sky.applyPreset(w);
  ocean.applyWeather(w);
  if (sky.envCube) ocean.setEnvironment(sky.envCube, sky.sunDir);
}
applyWeather(WEATHERS.paike);

// --- Paat ---
const boat = new PlayerBoat("kiirpaat", 0xe63946);
engine.scene.add(boat.mesh);
const spawn = track.spawnPoint(0);
boat.physics.reset(spawn.x, spawn.z, spawn.yaw);
boat.physics.surfaceOverride = track.surfaceOverride;

const chaseCam = new ChaseCamera(engine.camera);
chaseCam.snapTo(boat.physics);

boat.physics.onLanding = (impact) => {
  chaseCam.addTrauma(Math.min(impact * 0.06, 0.5));
};

// --- Võistlusloogika (soolo test — algab kohe) ---
const race = new RaceLogic(track, track.def.defaultLaps);
race.start();

// Ajutine debug-HUD kuni faasini 5
const hud = document.createElement("div");
hud.style.cssText =
  "position:fixed;left:12px;top:12px;color:#fff;font:14px monospace;background:rgba(0,0,0,.45);padding:8px 12px;border-radius:8px;white-space:pre;pointer-events:none";
document.getElementById("ui")!.appendChild(hud);

window.addEventListener("keydown", (e) => {
  if (e.code === "Digit1") applyWeather(WEATHERS.paike);
  if (e.code === "Digit2") applyWeather(WEATHERS.torm);
  if (e.code === "Digit3") applyWeather(WEATHERS.udu);
});

function respawn(): void {
  const g = race.lastGate;
  const p = boat.physics;
  p.reset(g.center.x, g.center.z, Math.atan2(g.dirX, g.dirZ));
  p.pos.y = getWaveHeight(weather.waves, g.center.x, g.center.z, engine.simTime);
  chaseCam.snapTo(p);
}

engine.onUpdate = (dt) => {
  if (input.respawnPressed) respawn();
  boat.update(
    { throttle: input.throttle, steer: input.steer, slide: input.slide },
    weather.waves,
    engine.simTime,
    dt,
  );
  const hit = resolveCollisions(boat.physics, track.colliders, track.terrain);
  if (hit && !hit.soft) chaseCam.addTrauma(Math.min(hit.impact * 0.05, 0.6));
  race.update(
    boat.physics.pos.x,
    boat.physics.pos.z,
    boat.physics.vel.x,
    boat.physics.vel.z,
    dt,
  );
  sky.update(dt);
};

let hudTimer = 0;
engine.onRender = (alpha, frameDt) => {
  boat.applyVisual(alpha);
  chaseCam.update(boat.physics, weather.waves, engine.simTime, frameDt);
  sky.followTarget(boat.physics.pos);
  track.update(weather.waves, engine.simTime, race.nextGate);
  ocean.update(engine.simTime, engine.camera.position);

  hudTimer -= frameDt;
  if (hudTimer <= 0) {
    hudTimer = 0.15;
    const kmh = Math.round(boat.physics.speed * 3.6);
    hud.textContent =
      `${kmh} km/h\n` +
      `Ring ${Math.min(race.lap, race.totalLaps)}/${race.totalLaps}  Värav ${race.nextGate}/${track.gates.length}\n` +
      `Aeg ${race.raceTime.toFixed(1)}s  FPS ${Math.round(engine.avgFps)}` +
      (race.wrongWay ? "\nVALE SUUND!" : "") +
      (race.finished ? "\nFINIŠ!" : "");
  }
  input.endFrame();
};

engine.start();
