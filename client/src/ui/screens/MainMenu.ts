import { h, type Screen } from "../ScreenManager";
import { t } from "../i18n/et";
import { buildLegend } from "../Legend";
import { PLAYER_COLORS } from "@shared/constants";
import { VEHICLES, VEHICLE_IDS } from "@shared/vehicles";
import { TRACKS, TRACK_IDS } from "@shared/tracks";
import type { TrackId, VehicleId, WeatherId } from "@shared/types";
import { WEATHERS } from "../../world/WeatherPresets";

export type GraphicsLevel = "korge" | "keskmine" | "madal";

export interface MenuChoices {
  name: string;
  color: number;
  vehicle: VehicleId;
  track: TrackId;
  weather: WeatherId;
  laps: number;
  graphics: GraphicsLevel;
}

const LS_KEY = "boatrace.menu";

/** Peamenüü: nimi, värv, sõiduk, ilm → proovisõit (võrgumäng faasis 6) */
export class MainMenu implements Screen {
  readonly el: HTMLElement;
  onSolo: (c: MenuChoices) => void = () => {};
  onMultiplayer: (c: MenuChoices) => void = () => {};
  onGraphics: (level: GraphicsLevel) => void = () => {};
  /** Rajavalik muutus — taustamaailm saab kohe kaasa vahetuda */
  onTrack: (id: TrackId) => void = () => {};
  /** Ilmavalik muutus — taust vahetab ilma kohe */
  onWeather: (id: WeatherId) => void = () => {};
  multiplayerEnabled = false;

  private choices: MenuChoices = {
    name: "",
    color: PLAYER_COLORS[0],
    vehicle: "kiirpaat",
    track: "saarestik",
    weather: "paike",
    laps: 3,
    graphics: "korge",
  };
  private nameInput: HTMLInputElement;
  private mpButton: HTMLButtonElement;

  constructor() {
    // Taasta viimased valikud
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
      Object.assign(this.choices, saved);
    } catch { /* tühi */ }

    this.nameInput = h("input", { type: "text", placeholder: t("menu.nimi.placeholder"), maxlength: "20" });
    this.nameInput.value = this.choices.name;

    // Värvivalik
    const swatches = h("div", { class: "row" });
    const swatchEls: HTMLElement[] = [];
    for (const c of PLAYER_COLORS) {
      const sw = h("div", { class: "swatch" });
      sw.style.background = `#${c.toString(16).padStart(6, "0")}`;
      if (c === this.choices.color) sw.classList.add("selected");
      sw.onclick = () => {
        swatchEls.forEach((e) => e.classList.remove("selected"));
        sw.classList.add("selected");
        this.choices.color = c;
        this.persist();
      };
      swatchEls.push(sw);
      swatches.appendChild(sw);
    }

    // Sõidukikaardid
    const vehicles = h("div", { class: "row" });
    const cardEls: HTMLElement[] = [];
    for (const id of VEHICLE_IDS) {
      const v = VEHICLES[id];
      const bar = (val: number): HTMLElement => {
        const fill = h("div");
        fill.style.width = `${Math.round(val * 100)}%`;
        return h("div", { class: "statbar" }, fill);
      };
      const card = h(
        "div",
        { class: "vehicle-card" },
        h("div", { class: "vname" }, v.nimi),
        h("div", { class: "vdesc" }, v.kirjeldus),
        h("div", { class: "vstats" }, bar(v.topSpeed / 35), bar(v.accel / 11), bar(v.grip)),
      );
      if (id === this.choices.vehicle) card.classList.add("selected");
      card.onclick = () => {
        cardEls.forEach((e) => e.classList.remove("selected"));
        card.classList.add("selected");
        this.choices.vehicle = id;
        this.persist();
      };
      cardEls.push(card);
      vehicles.appendChild(card);
    }

    // Rajavalik
    const tracks = h("div", { class: "row" });
    const trEls: HTMLElement[] = [];
    for (const id of TRACK_IDS) {
      const chip = h("div", { class: "chip" }, TRACKS[id]!.nimi);
      chip.title = TRACKS[id]!.kirjeldus;
      if (id === this.choices.track) chip.classList.add("selected");
      chip.onclick = () => {
        trEls.forEach((e) => e.classList.remove("selected"));
        chip.classList.add("selected");
        this.choices.track = id;
        this.persist();
        this.onTrack(id);
      };
      trEls.push(chip);
      tracks.appendChild(chip);
    }

    // Ilmavalik
    const weathers = h("div", { class: "row" });
    const wEls: HTMLElement[] = [];
    for (const w of Object.values(WEATHERS)) {
      const chip = h("div", { class: "chip" }, w.nimi);
      if (w.id === this.choices.weather) chip.classList.add("selected");
      chip.onclick = () => {
        wEls.forEach((e) => e.classList.remove("selected"));
        chip.classList.add("selected");
        this.choices.weather = w.id;
        this.persist();
        this.onWeather(w.id);
      };
      wEls.push(chip);
      weathers.appendChild(chip);
    }

    // Graafikatase
    const gfx = h("div", { class: "row" });
    const gEls: HTMLElement[] = [];
    for (const level of ["korge", "keskmine", "madal"] as GraphicsLevel[]) {
      const chip = h("div", { class: "chip" }, t(`menu.grafika.${level}` as never));
      if (level === this.choices.graphics) chip.classList.add("selected");
      chip.onclick = () => {
        gEls.forEach((e) => e.classList.remove("selected"));
        chip.classList.add("selected");
        this.choices.graphics = level;
        this.persist();
        this.onGraphics(level);
      };
      gEls.push(chip);
      gfx.appendChild(chip);
    }

    const soloBtn = h("button", { class: "primary" }, t("menu.proovisoit")) as HTMLButtonElement;
    soloBtn.onclick = () => {
      this.readName();
      this.onSolo({ ...this.choices });
    };
    this.mpButton = h("button", {}, `${t("menu.vorgumang")} (${t("menu.tulekul")})`) as HTMLButtonElement;
    this.mpButton.disabled = true;
    this.mpButton.onclick = () => {
      this.readName();
      this.onMultiplayer({ ...this.choices });
    };

    this.el = h(
      "div",
      {},
      h(
        "div",
        { class: "center-wrap" },
        h(
          "div",
          { class: "row", style: "gap:18px;align-items:center" },
          h("img", { src: "/brand/logo-ITK-white.svg", alt: "ITK", style: "height:56px" }),
          h("h1", { class: "title" }, t("menu.title")),
        ),
        h("p", { class: "subtitle" }, t("menu.subtitle")),
        h(
          "div",
          { class: "panel center-wrap", style: "gap:16px" },
          h("div", { class: "field", style: "width:280px" }, h("label", {}, t("menu.nimi")), this.nameInput),
          h("div", { class: "field" }, h("label", {}, t("menu.varv")), swatches),
          h("div", { class: "field" }, h("label", {}, t("menu.soiduk")), vehicles),
          h("div", { class: "field" }, h("label", {}, t("menu.rada")), tracks),
          h(
            "div",
            { class: "row", style: "gap:26px" },
            h("div", { class: "field" }, h("label", {}, t("menu.ilm")), weathers),
            h("div", { class: "field" }, h("label", {}, t("menu.grafika")), gfx),
          ),
          h("div", { class: "row", style: "margin-top:8px" }, soloBtn, this.mpButton),
          (() => {
            const details = h("details", { style: "width:100%;color:var(--text)" });
            const summary = h(
              "summary",
              { style: "cursor:pointer;color:var(--text-dim);font-size:.85rem" },
              t("menu.juhtimine"),
            );
            details.appendChild(summary);
            const inner = h("div", { style: "margin-top:10px" }, buildLegend());
            details.appendChild(inner);
            return details;
          })(),
        ),
      ),
    );
  }

  currentGraphics(): GraphicsLevel {
    return this.choices.graphics;
  }

  currentTrack(): TrackId {
    return this.choices.track;
  }

  currentWeather(): WeatherId {
    return this.choices.weather;
  }

  enableMultiplayer(): void {
    this.multiplayerEnabled = true;
    this.mpButton.disabled = false;
    this.mpButton.textContent = t("menu.vorgumang");
    this.mpButton.classList.add("primary");
  }

  private readName(): void {
    this.choices.name = this.nameInput.value.trim().slice(0, 20) || "Kapten";
    this.persist();
  }

  private persist(): void {
    localStorage.setItem(LS_KEY, JSON.stringify(this.choices));
  }
}
