import "./ui/styles/ui.css";
import { Game } from "./Game";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const uiRoot = document.getElementById("ui") as HTMLElement;

new Game(canvas, uiRoot);
