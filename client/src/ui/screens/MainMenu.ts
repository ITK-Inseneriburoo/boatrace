import { h, type Screen } from "../ScreenManager";
import { t } from "../i18n/et";
import { buildLegend } from "../Legend";
import { PLAYER_COLORS } from "@shared/constants";
import { VEHICLES, VEHICLE_IDS } from "@shared/vehicles";
import { TRACKS, TRACK_IDS } from "@shared/tracks";
import type { TrackId, VehicleId, WeatherId } from "@shared/types";
import { WEATHERS } from "../../world/WeatherPresets";
import type { GraphicsLevel } from "../../core/Quality";

export type { GraphicsLevel };

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
    this.choices.laps = this.choices.laps || TRACKS[this.choices.track]?.defaultLaps || 3;

    this.nameInput = h("input", { type: "text", placeholder: t("menu.nimi.placeholder"), maxlength: "20" });
    this.nameInput.value = this.choices.name;

    const selectByData = (items: HTMLElement[], key: string, value: string): void => {
      for (const e of items) e.classList.toggle("selected", e.dataset[key] === value);
    };

    // Värvivalik
    const swatches = h("div", { class: "row" });
    const swatchEls: HTMLElement[] = [];
    for (const c of PLAYER_COLORS) {
      const sw = h("div", { class: "swatch" });
      sw.dataset.color = String(c);
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
      const stat = (label: string, val: number): HTMLElement => {
        const fill = h("div");
        fill.style.width = `${Math.round(val * 100)}%`;
        return h(
          "div",
          { class: "statrow" },
          h("span", { class: "statlabel" }, label),
          h("div", { class: "statbar" }, fill),
        );
      };
      const card = h(
        "div",
        { class: "vehicle-card" },
        h("div", { class: "vname" }, v.nimi),
        h("div", { class: "vability" }, `Shift: ${v.abilityName}`),
        h("div", { class: "vdesc" }, v.kirjeldus),
        h(
          "div",
          { class: "vstats" },
          stat(t("menu.stat.kiirus"), v.topSpeed / 35),
          stat(t("menu.stat.kiirendus"), v.accel / 11),
          stat(t("menu.stat.haarduvus"), v.grip),
        ),
      );
      card.dataset.vehicle = id;
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
    const lapEls: HTMLElement[] = [];
    for (const id of TRACK_IDS) {
      const chip = h("div", { class: "chip" }, TRACKS[id]!.nimi);
      chip.dataset.track = id;
      chip.title = TRACKS[id]!.kirjeldus;
      if (id === this.choices.track) chip.classList.add("selected");
      chip.onclick = () => {
        const oldDefault = TRACKS[this.choices.track]?.defaultLaps;
        trEls.forEach((e) => e.classList.remove("selected"));
        chip.classList.add("selected");
        this.choices.track = id;
        if (this.choices.laps === oldDefault) {
          this.choices.laps = TRACKS[id]?.defaultLaps ?? this.choices.laps;
          selectByData(lapEls, "laps", String(this.choices.laps));
        }
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
      chip.dataset.weather = w.id;
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
    for (const level of ["ultra", "korge", "keskmine", "madal"] as GraphicsLevel[]) {
      const chip = h("div", { class: "chip" }, t(`menu.grafika.${level}` as never));
      chip.dataset.graphics = level;
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

    const laps = h("div", { class: "row" });
    for (const n of [1, 2, 3, 5]) {
      const chip = h("div", { class: "chip" }, String(n));
      chip.dataset.laps = String(n);
      if (n === this.choices.laps) chip.classList.add("selected");
      chip.onclick = () => {
        lapEls.forEach((e) => e.classList.remove("selected"));
        chip.classList.add("selected");
        this.choices.laps = n;
        this.persist();
      };
      lapEls.push(chip);
      laps.appendChild(chip);
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
    const sprintBtn = h("button", {}, t("menu.sprint")) as HTMLButtonElement;
    sprintBtn.onclick = () => {
      this.choices.laps = 1;
      selectByData(lapEls, "laps", "1");
      this.persist();
      this.readName();
      this.onSolo({ ...this.choices });
    };
    const randomBtn = h("button", {}, t("menu.yllata")) as HTMLButtonElement;
    randomBtn.onclick = () => {
      const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
      const track = pick(TRACK_IDS);
      const weather = pick(TRACKS[track]?.allowedWeathers ?? (Object.keys(WEATHERS) as MenuChoices["weather"][]));
      this.choices.color = pick(PLAYER_COLORS);
      this.choices.vehicle = pick(VEHICLE_IDS);
      this.choices.track = track;
      this.choices.weather = weather;
      this.choices.laps = TRACKS[track]?.defaultLaps ?? 3;
      selectByData(swatchEls, "color", String(this.choices.color));
      selectByData(cardEls, "vehicle", this.choices.vehicle);
      selectByData(trEls, "track", this.choices.track);
      selectByData(wEls, "weather", this.choices.weather);
      selectByData(lapEls, "laps", String(this.choices.laps));
      this.persist();
      this.onTrack(this.choices.track);
      this.onWeather(this.choices.weather);
    };

    // Sektsioon: eraldusjoon + sisu — hoiab seotud valikud visuaalselt koos
    const section = (...children: HTMLElement[]): HTMLElement =>
      h("div", { class: "menu-section" }, ...children);

    this.el = h(
      "div",
      {},
      h(
        "div",
        { class: "center-wrap" },
        h("h1", { class: "title" }, t("menu.title")),
        h("p", { class: "subtitle" }, t("menu.subtitle")),
        h(
          "div",
          { class: "panel menu-panel" },
          section(
            h(
              "div",
              { class: "row", style: "gap:26px;align-items:flex-start" },
              h("div", { class: "field", style: "width:220px" }, h("label", {}, t("menu.nimi")), this.nameInput),
              h("div", { class: "field" }, h("label", {}, t("menu.varv")), swatches),
            ),
          ),
          section(h("div", { class: "field" }, h("label", {}, t("menu.soiduk")), vehicles)),
          section(
            h("div", { class: "field" }, h("label", {}, t("menu.rada")), tracks),
            h(
              "div",
              { class: "row", style: "gap:26px" },
              h("div", { class: "field" }, h("label", {}, t("menu.ilm")), weathers),
              h("div", { class: "field" }, h("label", {}, t("menu.ringe")), laps),
            ),
          ),
          section(
            h("div", { class: "row", style: "justify-content:center" }, soloBtn, this.mpButton, sprintBtn, randomBtn),
          ),
          section(
            h(
              "div",
              { class: "row", style: "gap:26px;justify-content:space-between;width:100%" },
              h("div", { class: "field" }, h("label", {}, t("menu.grafika")), gfx),
              (() => {
                const details = h("details", { style: "color:var(--text)" });
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
