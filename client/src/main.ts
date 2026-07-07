import * as THREE from "three";
import { Engine } from "./core/Engine";
import { Input } from "./core/Input";
import { Ocean } from "./world/Ocean";
import { SkySystem } from "./world/SkySystem";
import { WEATHERS, type WeatherPreset } from "./world/WeatherPresets";
import { PlayerBoat } from "./sim/PlayerBoat";
import { ChaseCamera } from "./camera/ChaseCamera";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const engine = new Engine(canvas);
const input = new Input();

const sky = new SkySystem(engine);
const ocean = new Ocean();
engine.scene.add(ocean.group);

let weather = WEATHERS.paike;
function applyWeather(w: WeatherPreset): void {
  weather = w;
  sky.applyPreset(w);
  ocean.applyWeather(w);
  if (sky.envCube) ocean.setEnvironment(sky.envCube, sky.sunDir);
}
applyWeather(WEATHERS.paike);

// Ajutine testpaat + kaamera (menüüsüsteem tuleb faasis 5)
const boat = new PlayerBoat("kiirpaat", 0xe63946);
engine.scene.add(boat.mesh);
const chaseCam = new ChaseCamera(engine.camera);
chaseCam.snapTo(boat.physics);

boat.physics.onLanding = (impact) => {
  chaseCam.addTrauma(Math.min(impact * 0.06, 0.5));
};

// Ajutine ilmavahetus testiks: klahvid 1/2/3
window.addEventListener("keydown", (e) => {
  if (e.code === "Digit1") applyWeather(WEATHERS.paike);
  if (e.code === "Digit2") applyWeather(WEATHERS.torm);
  if (e.code === "Digit3") applyWeather(WEATHERS.udu);
});

engine.onUpdate = (dt) => {
  boat.update(
    { throttle: input.throttle, steer: input.steer, slide: input.slide },
    weather.waves,
    engine.simTime,
    dt,
  );
  sky.update(dt);
};

engine.onRender = (alpha, frameDt) => {
  boat.applyVisual(alpha);
  chaseCam.update(boat.physics, weather.waves, engine.simTime, frameDt);
  sky.followTarget(boat.physics.pos);
  ocean.update(engine.simTime, engine.camera.position);
  input.endFrame();
};

engine.start();
