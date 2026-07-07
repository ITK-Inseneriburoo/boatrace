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

/** Tulemuste ekraan (soolo: ringiajad; võrgus: kohatabel) */
export class ResultsScreen implements Screen {
  readonly el: HTMLElement;
  onRestart: () => void = () => {};
  onMenu: () => void = () => {};

  private tableWrap: HTMLElement;
  private lapsWrap: HTMLElement;

  constructor() {
    this.tableWrap = h("div", {});
    this.lapsWrap = h("div", { style: "color:var(--text-dim);font-size:0.9rem;white-space:pre-line" });
    const restart = h("button", { class: "primary" }, t("tulemused.uuesti"));
    restart.onclick = () => this.onRestart();
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
          this.tableWrap,
          this.lapsWrap,
          h("div", { class: "row" }, restart, menu),
        ),
      ),
    );
  }

  setResults(rows: ResultRow[], lapTimes?: number[]): void {
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

    if (lapTimes?.length) {
      this.lapsWrap.textContent =
        `${t("tulemused.ringid")}:\n` +
        lapTimes.map((ms, i) => `${i + 1}. ring — ${formatMs(ms)}`).join("\n");
    } else {
      this.lapsWrap.textContent = "";
    }
  }
}
