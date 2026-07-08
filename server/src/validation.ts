import type { C2S, RoomConfig } from "../../shared/src/protocol";
import { CHAT_MAX_LEN, NAME_MAX } from "../../shared/src/constants";
import { VEHICLES } from "../../shared/src/vehicles";
import { TRACKS } from "../../shared/src/tracks";

const WEATHER_IDS = new Set(["paike", "torm", "udu"]);

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
  if (clean.length < 1) return null;
  return clean.slice(0, NAME_MAX);
}

export function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.replace(CONTROL_CHARS, "").trim();
  if (!clean) return null;
  return clean.slice(0, CHAT_MAX_LEN);
}

function finiteArr(v: unknown, n: number): v is number[] {
  return Array.isArray(v) && v.length === n && v.every((x) => Number.isFinite(x));
}

function isVehicle(v: unknown): boolean {
  return typeof v === "string" && v in VEHICLES;
}

function validConfig(c: unknown): c is RoomConfig {
  if (typeof c !== "object" || c === null) return false;
  const o = c as Record<string, unknown>;
  return (
    typeof o.trackId === "string" &&
    o.trackId in TRACKS &&
    typeof o.weatherId === "string" &&
    WEATHER_IDS.has(o.weatherId) &&
    typeof o.laps === "number" &&
    Number.isInteger(o.laps) &&
    o.laps >= 1 &&
    o.laps <= 9
  );
}

/**
 * Valideerib sissetuleva sõnumi kuju. Tagastab null, kui sõnum on vigane.
 * KRIITILINE: iga float käib Number.isFinite kontrollist läbi — üks NaN
 * positsioon mürgitaks kõigi teiste klientide interpolatsiooni.
 */
export function validateC2S(raw: unknown): C2S | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  switch (m.type) {
    case "hello": {
      const name = sanitizeName(m.name);
      if (!name) return null;
      if (!Number.isInteger(m.color)) return null;
      if (m.sessionToken !== undefined && typeof m.sessionToken !== "string") return null;
      return { type: "hello", name, color: m.color as number, sessionToken: m.sessionToken as string | undefined };
    }
    case "listRooms":
      return { type: "listRooms" };
    case "createRoom": {
      const roomName = sanitizeName(m.roomName) ?? "";
      return { type: "createRoom", roomName };
    }
    case "joinRoom":
      return typeof m.roomId === "string" && m.roomId.length <= 12
        ? {
            type: "joinRoom",
            roomId: m.roomId,
            spectator: m.spectator === true,
          }
        : null;
    case "setSpectator":
      return typeof m.on === "boolean" ? { type: "setSpectator", on: m.on } : null;
    case "leaveRoom":
      return { type: "leaveRoom" };
    case "chat": {
      const text = sanitizeChat(m.text);
      return text ? { type: "chat", text } : null;
    }
    case "selectVehicle":
      return isVehicle(m.vehicle) ? { type: "selectVehicle", vehicle: m.vehicle as never } : null;
    case "setColor":
      return Number.isInteger(m.color) ? { type: "setColor", color: m.color as number } : null;
    case "setReady":
      return typeof m.ready === "boolean" ? { type: "setReady", ready: m.ready } : null;
    case "configureRace":
      return validConfig(m.config) ? { type: "configureRace", config: m.config } : null;
    case "startRace":
      return { type: "startRace" };
    case "state":
      if (!finiteArr(m.p, 3) || !finiteArr(m.r, 3) || !finiteArr(m.v, 2) || !Number.isFinite(m.s)) {
        return null;
      }
      return {
        type: "state",
        p: m.p as [number, number, number],
        r: m.r as [number, number, number],
        v: m.v as [number, number],
        s: m.s as number,
      };
    case "shot":
      return Number.isFinite(m.x) && Number.isFinite(m.z) && Number.isFinite(m.yaw)
        ? { type: "shot", x: m.x as number, z: m.z as number, yaw: m.yaw as number }
        : null;
    case "gate":
      return Number.isInteger(m.gate) && (m.gate as number) >= 0 && (m.gate as number) < 200
        ? { type: "gate", gate: m.gate as number }
        : null;
    case "respawn":
      return { type: "respawn" };
    case "ping":
      return Number.isFinite(m.t) ? { type: "ping", t: m.t as number } : null;
    default:
      return null;
  }
}
