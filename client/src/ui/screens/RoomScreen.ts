import { h, type Screen } from "../ScreenManager";
import { t } from "../i18n/et";
import type { RoomStateMsg } from "@shared/protocol";
import type { TrackId, VehicleId, WeatherId } from "@shared/types";
import { VEHICLES, VEHICLE_IDS } from "@shared/vehicles";
import { TRACKS, TRACK_IDS } from "@shared/tracks";
import { WEATHERS } from "../../world/WeatherPresets";

/** Võistlustoa ekraan: mängijad, sõidukivalik, hosti seaded, chat */
export class RoomScreen implements Screen {
  readonly el: HTMLElement;
  onReady: (ready: boolean) => void = () => {};
  onSpectator: (on: boolean) => void = () => {};
  onVehicle: (v: VehicleId) => void = () => {};
  onConfigure: (trackId: TrackId, weatherId: WeatherId, laps: number) => void = () => {};
  onStart: () => void = () => {};
  onLeave: () => void = () => {};
  onChat: (text: string) => void = () => {};

  private myId: string | null = null;
  private room: RoomStateMsg | null = null;
  private titleEl: HTMLElement;
  private roomMetaEl: HTMLElement;
  private noticeEl: HTMLElement;
  private playersWrap: HTMLElement;
  private vehiclesWrap: HTMLElement;
  private tracksWrap: HTMLElement;
  private weatherWrap: HTMLElement;
  private lapsWrap: HTMLElement;
  private readyBtn: HTMLButtonElement;
  private spectatorBtn: HTMLButtonElement;
  private startBtn: HTMLButtonElement;
  private shareBtn: HTMLButtonElement;
  private sprintBtn: HTMLButtonElement;
  private randomBtn: HTMLButtonElement;
  private chatLog: HTMLElement;
  private chatInput: HTMLInputElement;
  private myReady = false;
  private mySpectator = false;

  constructor() {
    this.titleEl = h("h2", { style: "margin:0" });
    this.roomMetaEl = h("div", { style: "color:var(--text-dim);font-size:.85rem" });
    this.noticeEl = h("div", { class: "notice", style: "display:none" });
    this.playersWrap = h("div", {});
    this.vehiclesWrap = h("div", { class: "row" });
    this.tracksWrap = h("div", { class: "row" });
    this.weatherWrap = h("div", { class: "row" });
    this.lapsWrap = h("div", { class: "row" });

    this.readyBtn = h("button", { class: "primary" }, t("tuba.valmis")) as HTMLButtonElement;
    this.readyBtn.onclick = () => {
      this.myReady = !this.myReady;
      this.onReady(this.myReady);
    };
    this.spectatorBtn = h("button", {}, t("tuba.vaatleja")) as HTMLButtonElement;
    this.spectatorBtn.onclick = () => {
      this.mySpectator = !this.mySpectator;
      this.onSpectator(this.mySpectator);
    };
    this.startBtn = h("button", { class: "primary" }, t("tuba.alusta")) as HTMLButtonElement;
    this.startBtn.onclick = () => this.onStart();
    this.shareBtn = h("button", {}, t("tuba.jaga")) as HTMLButtonElement;
    this.shareBtn.onclick = () => void this.copyRoomLink();
    this.sprintBtn = h("button", {}, t("tuba.sprint")) as HTMLButtonElement;
    this.sprintBtn.onclick = () => {
      if (!this.room) return;
      this.onConfigure(this.room.config.trackId, this.room.config.weatherId, 1);
    };
    this.randomBtn = h("button", {}, t("tuba.yllata")) as HTMLButtonElement;
    this.randomBtn.onclick = () => {
      const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
      const trackId = pick(TRACK_IDS);
      const weatherId = pick(TRACKS[trackId]?.allowedWeathers ?? (Object.keys(WEATHERS) as WeatherId[]));
      this.onConfigure(trackId, weatherId, TRACKS[trackId]?.defaultLaps ?? 2);
    };
    const leaveBtn = h("button", {}, t("tuba.lahku"));
    leaveBtn.onclick = () => this.onLeave();

    this.chatLog = h("div", {
      style:
        "height:110px;overflow-y:auto;background:rgba(0,0,0,.3);border-radius:8px;padding:8px 10px;font-size:.85rem;display:flex;flex-direction:column;gap:2px",
    });
    this.chatInput = h("input", {
      type: "text",
      placeholder: t("tuba.chat.placeholder"),
      maxlength: "200",
    });
    this.chatInput.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && this.chatInput.value.trim()) {
        this.onChat(this.chatInput.value.trim());
        this.chatInput.value = "";
      }
    };

    this.el = h(
      "div",
      {},
      h(
        "div",
        { class: "center-wrap" },
        h(
          "div",
          { class: "panel room-panel center-wrap", style: "gap:14px;min-width:640px" },
          h("img", {
            class: "panel-brand",
            src: "/brand/logo-ITK-white.svg",
            alt: "ITK Inseneribüroo",
          }),
          this.titleEl,
          this.roomMetaEl,
          this.noticeEl,
          this.playersWrap,
          h("div", { class: "field" }, h("label", {}, t("menu.soiduk")), this.vehiclesWrap),
          h("div", { class: "field" }, h("label", {}, t("menu.rada")), this.tracksWrap),
          h("div", { class: "field" }, h("label", {}, t("menu.ilm")), this.weatherWrap),
          h("div", { class: "field" }, h("label", {}, t("menu.ringe")), this.lapsWrap),
          h("div", { class: "field", style: "width:100%" }, this.chatLog, this.chatInput),
          h(
            "div",
            { class: "row" },
            this.readyBtn,
            this.spectatorBtn,
            this.startBtn,
            this.sprintBtn,
            this.randomBtn,
            this.shareBtn,
            leaveBtn,
          ),
        ),
      ),
    );
  }

  setMyId(id: string): void {
    this.myId = id;
  }

  addChat(name: string, text: string): void {
    const line = h("div", {}, h("b", {}, name + ": "), text);
    this.chatLog.appendChild(line);
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
    while (this.chatLog.children.length > 60) this.chatLog.firstChild?.remove();
  }

  showNotice(text: string): void {
    this.noticeEl.textContent = text;
    this.noticeEl.style.display = "";
  }

  setRoom(room: RoomStateMsg): void {
    this.room = room;
    const isHost = this.myId === room.hostId;
    const me = room.players.find((p) => p.id === this.myId);
    this.myReady = me?.ready ?? false;
    this.mySpectator = me?.spectator ?? false;

    this.titleEl.textContent = room.name;
    this.roomMetaEl.textContent = `${t("tuba.kood")}: ${room.id}`;

    // Mängijad
    const list = h("div", { style: "display:flex;flex-direction:column;gap:4px;width:100%" });
    for (const p of room.players) {
      const colorDot = h("span", {
        style: `display:inline-block;width:12px;height:12px;border-radius:50%;background:#${p.color
          .toString(16)
          .padStart(6, "0")};margin-right:8px`,
      });
      const tags: string[] = [];
      if (p.id === room.hostId) tags.push(t("tuba.host"));
      if (p.spectator) tags.push("👁 " + t("tuba.vaatleja").toLowerCase());
      if (!p.connected) tags.push("⚠ ühendus katkes");
      const ready = p.spectator || p.id === room.hostId || p.ready;
      const row = h(
        "div",
        { style: "display:flex;align-items:center;gap:8px" },
        colorDot,
        h("b", {}, p.name + (p.id === this.myId ? " (sina)" : "")),
        h("span", { style: "color:var(--text-dim);font-size:.82rem" }, VEHICLES[p.vehicle].nimi),
        h("span", { style: "color:var(--text-dim);font-size:.82rem" }, tags.join(" · ")),
        h(
          "span",
          { style: `margin-left:auto;font-size:.85rem;color:${ready ? "var(--accent)" : "var(--text-dim)"}` },
          p.spectator ? t("tuba.vaatlen") : ready ? "✓ " + t("tuba.valmis") : t("tuba.pole_valmis"),
        ),
      );
      list.appendChild(row);
    }
    this.playersWrap.replaceChildren(list);

    // Sõidukid
    this.vehiclesWrap.replaceChildren();
    for (const id of VEHICLE_IDS) {
      const chip = h("div", { class: "chip" }, VEHICLES[id].nimi);
      if (me?.vehicle === id) chip.classList.add("selected");
      chip.onclick = () => this.onVehicle(id);
      this.vehiclesWrap.appendChild(chip);
    }

    // Rada (ainult host saab muuta)
    this.tracksWrap.replaceChildren();
    for (const id of TRACK_IDS) {
      const chip = h("div", { class: "chip" }, TRACKS[id]!.nimi);
      chip.title = TRACKS[id]!.kirjeldus;
      if (room.config.trackId === id) chip.classList.add("selected");
      if (isHost) {
        chip.onclick = () =>
          this.onConfigure(id, room.config.weatherId, room.config.laps);
      } else {
        chip.style.cursor = "default";
        chip.style.opacity = "0.7";
      }
      this.tracksWrap.appendChild(chip);
    }

    // Ilm (ainult host saab muuta)
    this.weatherWrap.replaceChildren();
    for (const w of Object.values(WEATHERS)) {
      const chip = h("div", { class: "chip" }, w.nimi);
      if (room.config.weatherId === w.id) chip.classList.add("selected");
      if (isHost) {
        chip.onclick = () => this.onConfigure(room.config.trackId, w.id, room.config.laps);
      } else {
        chip.style.cursor = "default";
        chip.style.opacity = "0.7";
      }
      this.weatherWrap.appendChild(chip);
    }

    // Ringid
    this.lapsWrap.replaceChildren();
    for (const n of [1, 2, 3, 5]) {
      const chip = h("div", { class: "chip" }, String(n));
      if (room.config.laps === n) chip.classList.add("selected");
      if (isHost) {
        chip.onclick = () => this.onConfigure(room.config.trackId, room.config.weatherId, n);
      } else {
        chip.style.cursor = "default";
        chip.style.opacity = "0.7";
      }
      this.lapsWrap.appendChild(chip);
    }

    // Nupud
    this.readyBtn.style.display = isHost || this.mySpectator ? "none" : "";
    this.readyBtn.textContent = this.myReady ? "✓ " + t("tuba.valmis") : t("tuba.valmis");
    this.spectatorBtn.textContent = this.mySpectator
      ? t("tuba.vaatlen")
      : t("tuba.vaatleja");
    this.spectatorBtn.classList.toggle("primary", this.mySpectator);
    this.startBtn.style.display = isHost ? "" : "none";
    this.sprintBtn.style.display = isHost ? "" : "none";
    this.randomBtn.style.display = isHost ? "" : "none";
    const allReady = room.players.every(
      (p) => p.id === room.hostId || p.spectator || !p.connected || p.ready,
    );
    const racers = room.players.filter((p) => p.connected && !p.spectator).length;
    this.startBtn.disabled = !allReady || racers < 1;
  }

  private async copyRoomLink(): Promise<void> {
    if (!this.room) return;
    const url = `${location.origin}${location.pathname}#room=${this.room.id}`;
    try {
      await navigator.clipboard.writeText(url);
      this.showNotice(t("tuba.linkKopeeritud"));
    } catch {
      this.showNotice(url);
    }
  }
}
