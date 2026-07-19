import { randomUUID } from "node:crypto";
import type {
  RaceResultRow,
  RoomConfig,
  RoomStateMsg,
  RoomSummary,
  S2C,
} from "../../shared/src/protocol";
import type { RacePhase } from "../../shared/src/types";
import {
  COUNTDOWN_MS,
  DNF_TIMEOUT_MS,
  MAX_PLAYERS_PER_ROOM,
} from "../../shared/src/constants";
import { TRACKS } from "../../shared/src/tracks";
import type { Player } from "./Player";

/**
 * Võistlustuba + faasimasin:
 * LOBBY → COUNTDOWN → RACING → FINISHED → LOBBY
 *
 * Server on autoriteetne: võistluskell, väravate järjekord (N enne N+1),
 * ringid, finišijärjestus. Positsioone ainult releetakse.
 */
export class Room {
  readonly id = randomUUID().slice(0, 6);
  name: string;
  players: Player[] = [];
  hostId: string;
  config: RoomConfig = { trackId: "saarestik", weatherId: "paike", laps: 2 };
  phase: RacePhase = "lobby";

  raceStartsAt = 0;
  raceStartTime = 0;
  private finishCount = 0;
  private countdownTimer: NodeJS.Timeout | null = null;
  private dnfTimer: NodeJS.Timeout | null = null;
  private returnTimer: NodeJS.Timeout | null = null;
  private standingsTimer: NodeJS.Timeout | null = null;

  /** kutsutakse, kui toa nähtav olek muutus (roomList uuenduseks) */
  onChanged: () => void = () => {};

  constructor(name: string, host: Player) {
    this.name = name || `${host.name} tuba`;
    this.hostId = host.id;
  }

  /** Väravaid kokku (stardivärav 0 + rajaväravad) */
  get gateCount(): number {
    const def = TRACKS[this.config.trackId];
    return (def?.gates.length ?? 0) + 1;
  }

  broadcast(msg: S2C, except?: Player): void {
    for (const p of this.players) {
      if (p !== except) p.send(msg);
    }
  }

  summary(): RoomSummary {
    return {
      id: this.id,
      name: this.name,
      players: this.players.filter((p) => p.connected).length,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
      trackId: this.config.trackId,
      phase: this.phase,
    };
  }

  stateMsg(): RoomStateMsg {
    return {
      id: this.id,
      name: this.name,
      hostId: this.hostId,
      config: this.config,
      phase: this.phase,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        vehicle: p.vehicle,
        ready: p.ready,
        connected: p.connected,
        spectator: p.spectator,
      })),
    };
  }

  /** Saada kõigile värske toa snapshot (lihtsam kui deltad) */
  sync(): void {
    this.broadcast({ type: "roomState", room: this.stateMsg() });
    this.onChanged();
  }

  addPlayer(p: Player, spectator = false): "ok" | "full" | "racing" {
    if (this.players.filter((x) => x.connected).length >= MAX_PLAYERS_PER_ROOM) return "full";
    // Käimasoleva sõiduga saab liituda ainult vaatlejana
    if (this.phase !== "lobby" && !spectator) return "racing";
    p.spectator = spectator;
    this.players.push(p);
    p.room = this;
    p.ready = false;
    p.resetRaceProgress();
    this.sync();
    return "ok";
  }

  removePlayer(p: Player): void {
    const i = this.players.indexOf(p);
    if (i >= 0) this.players.splice(i, 1);
    p.room = null;
    if (this.players.length === 0) {
      this.stopTimers();
      this.onChanged();
      return;
    }
    // Hosti üleandmine kauimolnud mängijale
    if (this.hostId === p.id) this.hostId = this.players[0].id;
    // Poolelioleva loenduse ajal lahkumine katkestab stardi
    if (this.phase === "countdown") this.abortRace();
    if (this.phase === "racing") this.checkRaceEnd();
    this.sync();
  }

  get empty(): boolean {
    return this.players.length === 0;
  }

  /** Kas kõik peale hosti ja vaatlejate on valmis */
  allReady(): boolean {
    return this.players.every(
      (p) => p.id === this.hostId || p.spectator || !p.connected || p.ready,
    );
  }

  /** Võistlejad (mitte-vaatlejad) */
  get racers(): Player[] {
    return this.players.filter((p) => !p.spectator);
  }

  startRace(by: Player): "ok" | "not_host" | "not_ready" {
    if (by.id !== this.hostId) return "not_host";
    if (this.phase !== "lobby") return "not_host";
    if (!this.allReady()) return "not_ready";
    if (this.racers.length === 0) return "not_ready";

    this.phase = "countdown";
    this.finishCount = 0;
    this.raceStartsAt = Date.now() + COUNTDOWN_MS;
    const spawns: Record<string, number> = {};
    this.racers.forEach((p, i) => {
      p.resetRaceProgress();
      p.spawnSlot = i;
      spawns[p.id] = i;
    });
    this.broadcast({
      type: "countdown",
      startsAt: this.raceStartsAt,
      config: this.config,
      spawns,
    });
    this.sync();

    this.countdownTimer = setTimeout(() => {
      this.phase = "racing";
      this.raceStartTime = Date.now();
      for (const p of this.players) p.lapStartAt = this.raceStartTime;
      this.broadcast({ type: "raceStarted", startTime: this.raceStartTime });
      this.standingsTimer = setInterval(() => this.broadcastStandings(), 1000);
      this.sync();
    }, COUNTDOWN_MS);
    return "ok";
  }

  private abortRace(): void {
    this.stopTimers();
    this.phase = "lobby";
    for (const p of this.players) {
      p.ready = false;
      p.resetRaceProgress();
    }
    this.broadcast({ type: "raceAborted" });
    this.sync();
  }

  /**
   * Värava läbimise valideerimine: loeb AINULT siis, kui see on mängija
   * järgmine värav. Vale/duplikaat lihtsalt ignoreeritakse.
   */
  handleGate(p: Player, gate: number): void {
    if (this.phase !== "racing" || p.finished || p.dnf) return;
    if (gate !== p.nextGate % this.gateCount) return;

    const now = Date.now();
    p.gateTime = now;

    if (gate === 0) {
      const lapMs = now - p.lapStartAt;
      p.lapTimes.push(lapMs);
      p.lapStartAt = now;
      this.broadcast({ type: "lap", playerId: p.id, lap: p.lap, lapMs });
      if (p.lap >= this.config.laps) {
        p.finished = true;
        p.finishPosition = ++this.finishCount;
        p.totalMs = now - this.raceStartTime;
        this.broadcast({
          type: "finished",
          playerId: p.id,
          position: p.finishPosition,
          totalMs: p.totalMs,
        });
        if (this.finishCount === 1) {
          this.dnfTimer = setTimeout(() => this.endRace(), DNF_TIMEOUT_MS);
        }
        this.checkRaceEnd();
        return;
      }
      p.lap++;
    }
    p.nextGate = (gate + 1) % this.gateCount;
    this.broadcast({ type: "gateOk", playerId: p.id, gate, lap: p.lap });
  }

  private checkRaceEnd(): void {
    if (this.phase !== "racing") return;
    const active = this.racers.filter((p) => !p.finished && p.connected);
    if (active.length === 0) this.endRace();
  }

  private endRace(): void {
    if (this.phase !== "racing") return;
    this.phase = "finished";
    if (this.dnfTimer) clearTimeout(this.dnfTimer);
    if (this.standingsTimer) clearInterval(this.standingsTimer);
    this.dnfTimer = null;
    this.standingsTimer = null;

    const results: RaceResultRow[] = this.racers
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        vehicle: p.vehicle,
        position: p.finishPosition,
        totalMs: p.totalMs,
        bestLapMs: p.lapTimes.length ? Math.min(...p.lapTimes) : null,
        dnf: !p.finished,
      }))
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));

    this.broadcast({ type: "results", results });
    this.sync();

    this.returnTimer = setTimeout(() => {
      this.phase = "lobby";
      for (const p of this.players) {
        p.ready = false;
        p.resetRaceProgress();
      }
      this.sync();
    }, 12_000);
  }

  private broadcastStandings(): void {
    if (this.phase !== "racing") return;
    const gc = this.gateCount;
    const order = [...this.racers]
      .sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        if (a.finished && b.finished) return (a.finishPosition ?? 99) - (b.finishPosition ?? 99);
        const ga = a.gatesPassed(gc), gb = b.gatesPassed(gc);
        if (ga !== gb) return gb - ga;
        return a.gateTime - b.gateTime; // varem väravas = eespool
      })
      .map((p) => p.id);
    this.broadcast({ type: "standings", order });
  }

  stopTimers(): void {
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    if (this.dnfTimer) clearTimeout(this.dnfTimer);
    if (this.returnTimer) clearTimeout(this.returnTimer);
    if (this.standingsTimer) clearInterval(this.standingsTimer);
    this.countdownTimer = this.dnfTimer = this.returnTimer = null;
    this.standingsTimer = null;
  }
}
