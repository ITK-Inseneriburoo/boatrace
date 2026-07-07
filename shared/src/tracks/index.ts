import type { TrackId } from "../types";
import type { TrackDef } from "./types";
import { saarestik } from "./saarestik";
import { sadamalinn } from "./sadamalinn";
import { joekanjon } from "./joekanjon";

export * from "./types";
export { saarestik, sadamalinn, joekanjon };

export const TRACKS: Partial<Record<TrackId, TrackDef>> = {
  saarestik,
  sadamalinn,
  joekanjon,
};

export const TRACK_IDS = Object.keys(TRACKS) as TrackId[];

export function getTrack(id: TrackId): TrackDef {
  const t = TRACKS[id];
  if (!t) throw new Error(`Tundmatu rada: ${id}`);
  return t;
}
