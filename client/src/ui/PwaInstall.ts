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

/** Menüü PWA installi- ja brauseri täisekraani tegevused. */
export class PwaInstall {
  readonly el: HTMLElement;

  private readonly installBtn: HTMLButtonElement;
  private readonly fullscreenBtn: HTMLButtonElement;
  private readonly hintEl: HTMLElement;
  private deferredPrompt: InstallPromptEvent | null = null;

  constructor() {
    this.installBtn = h(
      "button",
      { type: "button", class: "pwa-install" },
      t("pwa.installi"),
    ) as HTMLButtonElement;
    this.fullscreenBtn = h(
      "button",
      { type: "button" },
      t("pwa.taisekraan"),
    ) as HTMLButtonElement;
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
