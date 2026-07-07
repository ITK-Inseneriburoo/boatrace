import { h, type Screen } from "../ScreenManager";
import { t } from "../i18n/et";
import type { RoomSummary } from "@shared/protocol";
import { TRACKS } from "@shared/tracks";

/** Tubade nimekiri: liitu või loo uus */
export class LobbyBrowser implements Screen {
  readonly el: HTMLElement;
  onJoin: (roomId: string) => void = () => {};
  onCreate: (name: string) => void = () => {};
  onBack: () => void = () => {};

  private listWrap: HTMLElement;
  private statusEl: HTMLElement;
  private nameInput: HTMLInputElement;

  constructor() {
    this.listWrap = h("div", {});
    this.statusEl = h("div", { style: "color:var(--text-dim)" }, t("lobby.yhendus"));
    this.nameInput = h("input", {
      type: "text",
      placeholder: t("lobby.tubaNimi"),
      maxlength: "20",
      style: "width:200px",
    });
    const createBtn = h("button", { class: "primary" }, t("lobby.uusTuba"));
    createBtn.onclick = () => this.onCreate(this.nameInput.value.trim());
    const backBtn = h("button", {}, t("lobby.tagasi"));
    backBtn.onclick = () => this.onBack();

    this.el = h(
      "div",
      {},
      h(
        "div",
        { class: "center-wrap" },
        h(
          "div",
          { class: "panel center-wrap", style: "gap:16px;min-width:520px" },
          h("h2", { style: "margin:0" }, t("lobby.pealkiri")),
          this.statusEl,
          this.listWrap,
          h("div", { class: "row" }, this.nameInput, createBtn, backBtn),
        ),
      ),
    );
  }

  setConnectionStatus(connected: boolean): void {
    this.statusEl.textContent = connected ? "" : t("lobby.katkes");
    this.statusEl.style.display = connected ? "none" : "";
  }

  setRooms(rooms: RoomSummary[]): void {
    if (!rooms.length) {
      this.listWrap.replaceChildren(
        h("div", { style: "color:var(--text-dim);padding:12px 0" }, t("lobby.tyhi")),
      );
      return;
    }
    const table = h(
      "table",
      { class: "results" },
      h(
        "tr",
        {},
        h("th", {}, t("lobby.tubaNimi")),
        h("th", {}, t("lobby.mangijaid")),
        h("th", {}, t("lobby.rada")),
        h("th", {}, ""),
      ),
    );
    for (const r of rooms) {
      const joinBtn = h("button", {}, t("lobby.liitu")) as HTMLButtonElement;
      joinBtn.disabled = r.players >= r.maxPlayers || r.phase !== "lobby";
      joinBtn.onclick = () => this.onJoin(r.id);
      table.appendChild(
        h(
          "tr",
          {},
          h("td", {}, r.name),
          h("td", {}, `${r.players}/${r.maxPlayers}`),
          h("td", {}, TRACKS[r.trackId]?.nimi ?? r.trackId),
          h("td", {}, joinBtn),
        ),
      );
    }
    this.listWrap.replaceChildren(table);
  }
}
