import "./ui/styles/ui.css";
import { Game } from "./Game";
import { isAppleMobile } from "./core/Platform";

document.documentElement.classList.toggle("apple-mobile", isAppleMobile());

const canvas = document.getElementById("game") as HTMLCanvasElement;
const uiRoot = document.getElementById("ui") as HTMLElement;

new Game(canvas, uiRoot);
