import { h } from "../ScreenManager";
import { t } from "../i18n/et";
import { Minimap, type MinimapDot } from "../Minimap";
import { buildLegend } from "../Legend";
import type { TrackWorld } from "../../world/TrackBuilder";

export function formatMs(ms: number): string {
  if (!isFinite(ms)) return "–:––.–";
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const d = Math.floor((total % 1000) / 100);
  return `${m}:${String(s).padStart(2, "0")}.${d}`;
}

/** Sõiduaegne HUD: kiirus, ring, koht, ajad, minimap, teated */
export class Hud {
  readonly el: HTMLElement;
  private speedNum: HTMLElement;
  private lapEl: HTMLElement;
  private timesEl: HTMLElement;
  private posEl: HTMLElement;
  private wrongEl: HTMLElement;
  private centerEl: HTMLElement;
  private hintEl: HTMLElement;
  private minimap: Minimap | null = null;
  private centerTimer = 0;
  private legendEl: HTMLElement;

  constructor() {
    this.speedNum = h("div", { class: "num" }, "0");
    this.lapEl = h("div", { class: "hud-item", id: "hud-lap" });
    this.timesEl = h("div", { class: "hud-item", id: "hud-times" });
    this.posEl = h("div", { class: "hud-item", id: "hud-pos" });
    this.wrongEl = h("div", { class: "hud-item", id: "hud-wrongway" }, t("hud.valesuund"));
    this.centerEl = h("div", { class: "hud-item", id: "hud-center" });
    this.hintEl = h("div", { class: "hud-item", id: "hud-hint" }, t("hud.respawn"));
    this.wrongEl.style.display = "none";
    this.legendEl = h(
      "div",
      {
        class: "hud-item panel",
        style: "right:24px;top:80px;padding:16px 20px;display:none",
      },
      buildLegend(),
    );
    this.el = h(
      "div",
      { id: "hud" },
      this.legendEl,
      h(
        "div",
        { class: "hud-item", id: "hud-speed" },
        this.speedNum,
        h("div", { class: "unit" }, t("hud.kmh")),
      ),
      this.lapEl,
      this.timesEl,
      this.posEl,
      this.wrongEl,
      this.centerEl,
      this.hintEl,
    );
    this.el.style.display = "none";
  }

  attachTrack(track: TrackWorld): void {
    this.minimap?.canvas.remove();
    this.minimap = new Minimap(track);
    this.el.appendChild(this.minimap.canvas);
  }

  show(): void {
    this.el.style.display = "";
  }
  hide(): void {
    this.el.style.display = "none";
    this.legendEl.style.display = "none";
  }

  toggleLegend(): void {
    this.legendEl.style.display = this.legendEl.style.display === "none" ? "" : "none";
  }

  /** Vaatlejavaade: peida sõitjaspetsiifiline (kiirus, ring, ajad, koht) */
  setSpectator(on: boolean, legend?: string): void {
    const d = on ? "none" : "";
    this.speedNum.parentElement!.style.display = d;
    this.lapEl.style.display = d;
    this.timesEl.style.display = d;
    this.posEl.style.display = d;
    this.hintEl.textContent = on && legend ? legend : t("hud.respawn");
  }

  setSpeed(kmh: number): void {
    this.speedNum.textContent = String(Math.max(0, Math.round(kmh)));
  }

  setLap(lap: number, total: number, gate: number, gates: number): void {
    this.lapEl.textContent = `${t("hud.ring")} ${lap}/${total} · ${t("hud.varav")} ${gate}/${gates}`;
  }

  setTimes(currentMs: number, lastLapMs: number | null, bestMs: number): void {
    let s = `${t("hud.aeg")} ${formatMs(currentMs)}`;
    if (lastLapMs !== null) s += `\n${t("hud.ringiaeg")} ${formatMs(lastLapMs)}`;
    if (isFinite(bestMs)) s += `\n${t("hud.parim")} ${formatMs(bestMs)}`;
    this.timesEl.textContent = s;
  }

  setPosition(pos: number | null, total: number): void {
    this.posEl.textContent = pos === null ? "" : `${pos}./${total}.`;
  }

  setWrongWay(on: boolean): void {
    this.wrongEl.style.display = on ? "" : "none";
  }

  /** Suur keskteade (loendus, START, FINIŠ) — kaob ise */
  flashCenter(text: string, seconds = 1): void {
    this.centerEl.textContent = text;
    this.centerTimer = seconds;
    this.centerEl.style.display = "";
  }

  update(dt: number, dots: MinimapDot[]): void {
    if (this.centerTimer > 0) {
      this.centerTimer -= dt;
      if (this.centerTimer <= 0) this.centerEl.style.display = "none";
    }
    this.minimap?.render(dots);
  }
}
