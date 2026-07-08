import { h, type Screen } from "../ScreenManager";
import { t } from "../i18n/et";
import { formatMs } from "./Hud";

export interface ResultRow {
  position: number | null;
  name: string;
  totalMs: number | null;
  bestLapMs: number;
  me: boolean;
  dnf?: boolean;
}

export interface ResultsMeta {
  trackName: string;
  weatherName: string;
  vehicleName: string;
  laps: number;
  bestLapMs: number;
  newRecord: boolean;
  variantLabel?: string;
}

/** Tulemuste ekraan (soolo: ringiajad; võrgus: kohatabel) */
export class ResultsScreen implements Screen {
  readonly el: HTMLElement;
  onRestart: () => void = () => {};
  onVariant: () => void = () => {};
  onMenu: () => void = () => {};

  private summaryWrap: HTMLElement;
  private tableWrap: HTMLElement;
  private lapsWrap: HTMLElement;
  private variantBtn: HTMLButtonElement;

  constructor() {
    this.summaryWrap = h("div", { class: "result-summary" });
    this.tableWrap = h("div", {});
    this.lapsWrap = h("div", { style: "color:var(--text-dim);font-size:0.9rem;white-space:pre-line" });
    const restart = h("button", { class: "primary" }, t("tulemused.uuesti"));
    restart.onclick = () => this.onRestart();
    this.variantBtn = h("button", {}, t("tulemused.jargmineIlm")) as HTMLButtonElement;
    this.variantBtn.onclick = () => this.onVariant();
    const menu = h("button", {}, t("tulemused.menyysse"));
    menu.onclick = () => this.onMenu();

    this.el = h(
      "div",
      {},
      h(
        "div",
        { class: "center-wrap" },
        h(
          "div",
          { class: "panel center-wrap", style: "gap:18px" },
          h("h2", { style: "margin:0" }, t("tulemused.pealkiri")),
          this.summaryWrap,
          this.tableWrap,
          this.lapsWrap,
          h("div", { class: "row" }, restart, this.variantBtn, menu),
        ),
      ),
    );
  }

  setResults(rows: ResultRow[], lapTimes?: number[], meta?: ResultsMeta): void {
    const table = h(
      "table",
      { class: "results" },
      h(
        "tr",
        {},
        h("th", {}, t("tulemused.koht")),
        h("th", {}, t("tulemused.nimi")),
        h("th", {}, t("tulemused.aeg")),
        h("th", {}, t("tulemused.parimRing")),
      ),
    );
    for (const r of rows) {
      const tr = h(
        "tr",
        { class: r.me ? "me" : "" },
        h("td", {}, r.dnf ? t("tulemused.dnf") : r.position !== null ? `${r.position}.` : "–"),
        h("td", {}, r.name),
        h("td", {}, r.totalMs !== null ? formatMs(r.totalMs) : "–"),
        h("td", {}, formatMs(r.bestLapMs)),
      );
      table.appendChild(tr);
    }
    this.tableWrap.replaceChildren(table);
    this.variantBtn.style.display = meta?.variantLabel ? "" : "none";
    if (meta?.variantLabel) this.variantBtn.textContent = meta.variantLabel;

    if (meta) {
      this.summaryWrap.replaceChildren(
        this.summaryCard(t("tulemused.rada"), `${meta.trackName} · ${meta.weatherName}`),
        this.summaryCard(t("tulemused.seade"), `${meta.vehicleName} · ${meta.laps} ringi`),
        this.summaryCard(
          meta.newRecord ? t("tulemused.rekord") : t("tulemused.parimRing"),
          formatMs(meta.bestLapMs),
          meta.newRecord ? "hot" : "",
        ),
        this.summaryCard(
          t("tulemused.soovitus"),
          meta.newRecord ? t("tulemused.sihtBoost") : t("tulemused.sihtRekord"),
        ),
      );
    } else {
      this.summaryWrap.replaceChildren();
    }

    if (lapTimes?.length) {
      this.lapsWrap.textContent =
        `${t("tulemused.ringid")}:\n` +
        lapTimes.map((ms, i) => `${i + 1}. ring — ${formatMs(ms)}`).join("\n");
    } else {
      this.lapsWrap.textContent = "";
    }
  }

  private summaryCard(label: string, value: string, extraClass = ""): HTMLElement {
    return h(
      "div",
      { class: `summary-card ${extraClass}`.trim() },
      h("div", { class: "summary-label" }, label),
      h("div", { class: "summary-value" }, value),
    );
  }
}
