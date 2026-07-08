import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { S2C } from "../../shared/src/protocol";
import type { VehicleId } from "../../shared/src/types";
import type { Room } from "./Room";

export class Player {
  readonly id = randomUUID().slice(0, 8);
  readonly token = randomUUID();
  name: string;
  color: number;
  vehicle: VehicleId = "kiirpaat";
  ready = false;
  spectator = false;
  socket: WebSocket | null = null;
  room: Room | null = null;
  disconnectedAt: number | null = null;

  // --- Võistlusprogress (server on tulemuste autoriteet) ---
  nextGate = 1;
  lap = 1;
  lapTimes: number[] = [];
  lapStartAt = 0;
  /** viimase värava läbimise aeg (edetabeli tie-break) */
  gateTime = 0;
  finished = false;
  finishPosition: number | null = null;
  totalMs: number | null = null;
  dnf = false;

  // --- Anti-kaos ---
  lastStatePos: [number, number, number] | null = null;
  lastStateAt = 0;
  stateWindow = { start: 0, count: 0 };
  msgWindow = { start: 0, count: 0 };
  chatTimes: number[] = [];
  lastShotAt = 0;
  /** stardikoha positsioon (stardieelse liikumise tõkkeks) */
  spawnSlot = 0;

  constructor(name: string, color: number) {
    this.name = name;
    this.color = color;
  }

  get connected(): boolean {
    return this.socket !== null && this.disconnectedAt === null;
  }

  send(msg: S2C): void {
    if (this.socket && this.socket.readyState === this.socket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  resetRaceProgress(): void {
    this.nextGate = 1;
    this.lap = 1;
    this.lapTimes = [];
    this.lapStartAt = 0;
    this.gateTime = 0;
    this.finished = false;
    this.finishPosition = null;
    this.totalMs = null;
    this.dnf = false;
    this.lastStatePos = null;
    this.lastShotAt = 0;
  }

  /** Väravaid läbitud kokku (edetabeli järjestuseks) */
  gatesPassed(gateCount: number): number {
    return (this.lap - 1) * gateCount + ((this.nextGate - 1 + gateCount) % gateCount);
  }
}
