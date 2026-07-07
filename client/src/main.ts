import * as THREE from "three";
import { Engine } from "./core/Engine";
import { Input } from "./core/Input";
import { Ocean } from "./world/Ocean";
import { SkySystem } from "./world/SkySystem";
import { WEATHERS } from "./world/WeatherPresets";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const engine = new Engine(canvas);
const input = new Input();

const sky = new SkySystem(engine);
const ocean = new Ocean();
engine.scene.add(ocean.group);

let weather = WEATHERS.paike;
function applyWeather(w: typeof weather): void {
  weather = w;
  sky.applyPreset(w);
  ocean.applyWeather(w);
  if (sky.envCube) ocean.setEnvironment(sky.envCube, sky.sunDir);
}
applyWeather(WEATHERS.paike);

// Ajutine ilmavahetus testiks: klahvid 1/2/3
window.addEventListener("keydown", (e) => {
  if (e.code === "Digit1") applyWeather(WEATHERS.paike);
  if (e.code === "Digit2") applyWeather(WEATHERS.torm);
  if (e.code === "Digit3") applyWeather(WEATHERS.udu);
});

engine.camera.position.set(0, 6, 18);
engine.camera.lookAt(0, 0, -30);

engine.onUpdate = (dt) => {
  sky.update(dt);
};

engine.onRender = () => {
  ocean.update(engine.simTime, engine.camera.position);
  input.endFrame();
};

engine.start();
