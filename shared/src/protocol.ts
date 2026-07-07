import type { RacePhase, TrackId, VehicleId, WeatherId } from "./types";

export interface PlayerInfo {
  id: string;
  name: string;
  color: number;
  vehicle: VehicleId;
  ready: boolean;
  connected: boolean;
}

export interface RoomConfig {
  trackId: TrackId;
  weatherId: WeatherId;
  laps: number;
}

export interface RoomSummary {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  trackId: TrackId;
  phase: RacePhase;
}

export interface RoomStateMsg {
  id: string;
  name: string;
  hostId: string;
  config: RoomConfig;
  phase: RacePhase;
  players: PlayerInfo[];
}

export interface RaceResultRow {
  playerId: string;
  name: string;
  vehicle: VehicleId;
  position: number | null;
  totalMs: number | null;
  bestLapMs: number | null;
  dnf: boolean;
}

/**
 * Olekusõnum (15Hz): p = positsioon, r = [yaw, pitch, roll],
 * v = kiirus XZ (ekstrapoleerimiseks), s = kiirus m/s (heli/efektid)
 */
export interface StatePayload {
  p: [number, number, number];
  r: [number, number, number];
  v: [number, number];
  s: number;
}

export type C2S =
  | { type: "hello"; name: string; color: number; sessionToken?: string }
  | { type: "listRooms" }
  | { type: "createRoom"; roomName: string }
  | { type: "joinRoom"; roomId: string }
  | { type: "leaveRoom" }
  | { type: "chat"; text: string }
  | { type: "selectVehicle"; vehicle: VehicleId }
  | { type: "setColor"; color: number }
  | { type: "setReady"; ready: boolean }
  | { type: "configureRace"; config: RoomConfig }
  | { type: "startRace" }
  | ({ type: "state" } & StatePayload)
  | { type: "gate"; gate: number }
  | { type: "respawn" }
  | { type: "ping"; t: number };

export type S2C =
  | { type: "welcome"; playerId: string; sessionToken: string; serverTime: number }
  | { type: "roomList"; rooms: RoomSummary[] }
  | { type: "roomState"; room: RoomStateMsg }
  | { type: "leftRoom" }
  | { type: "chat"; playerId: string; name: string; text: string }
  | {
      type: "countdown";
      /** serveri kellaaeg, millal sõit algab */
      startsAt: number;
      config: RoomConfig;
      /** playerId → stardikoha järjekorranumber */
      spawns: Record<string, number>;
    }
  | { type: "raceStarted"; startTime: number }
  | ({ type: "peer"; id: string; st: number } & StatePayload)
  | { type: "gateOk"; playerId: string; gate: number; lap: number }
  | { type: "lap"; playerId: string; lap: number; lapMs: number }
  | { type: "finished"; playerId: string; position: number; totalMs: number }
  | { type: "results"; results: RaceResultRow[] }
  | { type: "standings"; order: string[] }
  | { type: "raceAborted" }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "pong"; t: number; serverTime: number };

export type ErrorCode =
  | "BAD_NAME"
  | "ROOM_FULL"
  | "ROOM_NOT_FOUND"
  | "ROOM_RACING"
  | "NOT_HOST"
  | "NOT_ALL_READY"
  | "TOO_MANY_ROOMS"
  | "RATE_LIMITED"
  | "BAD_MESSAGE";
