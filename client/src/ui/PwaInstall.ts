import { h } from "./ScreenManager";
import { t } from "./i18n/et";
import { isAppleMobile } from "../core/Platform";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface LockableOrientation extends ScreenOrientation {
  lock?: (orientation: "landscape") => Promise<void>;
}

function isStandalone(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return (
    matchMedia("(display-mode: standalone)").matches ||
    matchMedia("(display-mode: fullscreen)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function actionIcon(kind: "install" | "fullscreen"): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "pwa-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS(ns, "path");
  path.setAttribute(
    "d",
    kind === "install"
      ? "M12 3v11m-4-4 4 4 4-4M5 17v3h14v-3"
      : "M8 3H3v5m13-5h5v5M8 21H3v-5m18 0v5h-5",
  );
  svg.appendChild(path);
  return svg;
}

/** Menüü PWA installi- ja brauseri täisekraani tegevused. */
export class PwaInstall {
  readonly el: HTMLElement;

  private readonly installBtn: HTMLButtonElement;
  private readonly fullscreenBtn: HTMLButtonElement;
  private readonly hintEl: HTMLElement;
  private deferredPrompt: InstallPromptEvent | null = null;

  constructor() {
    const installLabel = t("pwa.installi");
    this.installBtn = h(
      "button",
      {
        type: "button",
        class: "pwa-action pwa-install",
        title: installLabel,
        "aria-label": installLabel,
      },
    ) as HTMLButtonElement;
    this.installBtn.appendChild(actionIcon("install"));

    const fullscreenLabel = t("pwa.taisekraan");
    this.fullscreenBtn = h(
      "button",
      {
        type: "button",
        class: "pwa-action pwa-fullscreen",
        title: fullscreenLabel,
        "aria-label": fullscreenLabel,
      },
    ) as HTMLButtonElement;
    this.fullscreenBtn.appendChild(actionIcon("fullscreen"));
    this.hintEl = h("div", { class: "pwa-hint" });

    this.el = h(
      "div",
      { class: "pwa-actions" },
      this.installBtn,
      this.fullscreenBtn,
      this.hintEl,
    );

    this.installBtn.onclick = () => void this.install();
    this.fullscreenBtn.onclick = () => void this.enterFullscreen();

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      this.deferredPrompt = event as InstallPromptEvent;
      this.sync();
    });
    window.addEventListener("appinstalled", () => {
      this.deferredPrompt = null;
      this.hintEl.textContent = "";
      this.sync();
    });
    document.addEventListener("fullscreenchange", () => this.sync());

    this.sync();
  }

  private sync(): void {
    const standalone = isStandalone();
    this.installBtn.hidden = standalone || (!isAppleMobile() && this.deferredPrompt === null);
    this.fullscreenBtn.hidden = standalone || !document.fullscreenEnabled || !!document.fullscreenElement;
    this.el.hidden = this.installBtn.hidden && this.fullscreenBtn.hidden;
  }

  private async install(): Promise<void> {
    if (this.deferredPrompt) {
      const prompt = this.deferredPrompt;
      this.deferredPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome !== "accepted") this.installBtn.hidden = false;
      this.sync();
      return;
    }

    this.hintEl.textContent = isAppleMobile()
      ? t("pwa.appleJuhis")
      : t("pwa.brauserJuhis");
  }

  private async enterFullscreen(): Promise<void> {
    if (!document.fullscreenEnabled || document.fullscreenElement) return;
    try {
      await document.documentElement.requestFullscreen();
      const orientation = screen.orientation as LockableOrientation;
      await orientation.lock?.("landscape").catch(() => undefined);
    } catch {
      this.hintEl.textContent = t("pwa.taisekraanEiOnnestunud");
    }
    this.sync();
  }
}
