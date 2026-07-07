import { h, type Screen } from "../ScreenManager";
import { t } from "../i18n/et";
import { PLAYER_COLORS } from "@shared/constants";
import { VEHICLES, VEHICLE_IDS } from "@shared/vehicles";
import type { VehicleId, WeatherId } from "@shared/types";
import { WEATHERS } from "../../world/WeatherPresets";

export interface MenuChoices {
  name: string;
  color: number;
  vehicle: VehicleId;
  weather: WeatherId;
  laps: number;
}

const LS_KEY = "boatrace.menu";

/** Peamenüü: nimi, värv, sõiduk, ilm → proovisõit (võrgumäng faasis 6) */
export class MainMenu implements Screen {
  readonly el: HTMLElement;
  onSolo: (c: MenuChoices) => void = () => {};
  onMultiplayer: (c: MenuChoices) => void = () => {};
  multiplayerEnabled = false;

  private choices: MenuChoices = {
    name: "",
    color: PLAYER_COLORS[0],
    vehicle: "kiirpaat",
    weather: "paike",
    laps: 3,
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
        h("div", { class: "vstats" }, bar(v.topSpeed / 30), bar(v.accel / 10), bar(v.grip)),
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
      };
      wEls.push(chip);
      weathers.appendChild(chip);
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
        h("h1", { class: "title" }, t("menu.title")),
        h("p", { class: "subtitle" }, t("menu.subtitle")),
        h(
          "div",
          { class: "panel center-wrap", style: "gap:16px" },
          h("div", { class: "field", style: "width:280px" }, h("label", {}, t("menu.nimi")), this.nameInput),
          h("div", { class: "field" }, h("label", {}, t("menu.varv")), swatches),
          h("div", { class: "field" }, h("label", {}, t("menu.soiduk")), vehicles),
          h("div", { class: "field" }, h("label", {}, t("menu.ilm")), weathers),
          h("div", { class: "row", style: "margin-top:8px" }, soloBtn, this.mpButton),
        ),
      ),
    );
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
