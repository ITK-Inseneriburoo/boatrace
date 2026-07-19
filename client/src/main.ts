import "./ui/styles/ui.css";
import { registerSW } from "virtual:pwa-register";
import { Game } from "./Game";
import { isAppleMobile } from "./core/Platform";
import { t } from "./ui/i18n/et";

document.documentElement.classList.toggle("apple-mobile", isAppleMobile());

registerSW({
  immediate: true,
  onRegisterError: (err) => console.error("Offline-vahemälu käivitamine ebaõnnestus:", err),
});

const canvas = document.getElementById("game") as HTMLCanvasElement;
const uiRoot = document.getElementById("ui") as HTMLElement;
const bootLoader = document.getElementById("boot-loader") as HTMLElement;
const bootStatus = document.getElementById("boot-status") as HTMLElement;

async function boot(): Promise<void> {
  bootStatus.textContent = t("boot.laadimine");
  try {
    const game = new Game(canvas, uiRoot);
    await game.start();
    bootLoader.classList.add("done");
    window.setTimeout(() => bootLoader.remove(), 450);
  } catch (err) {
    console.error("Mängu käivitamine ebaõnnestus:", err);
    bootLoader.classList.add("failed");
    bootStatus.textContent = t("boot.viga");
  }
}

void boot();
