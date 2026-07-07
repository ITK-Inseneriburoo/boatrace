import * as THREE from "three";
import { Engine } from "./core/Engine";
import { Input } from "./core/Input";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const engine = new Engine(canvas);
const input = new Input();

engine.scene.background = new THREE.Color(0x1a3d5c);

engine.onRender = () => {
  input.endFrame();
};

engine.start();
