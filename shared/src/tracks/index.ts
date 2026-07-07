import type { TrackId } from "../types";
import type { TrackDef } from "./types";
import { saarestik } from "./saarestik";

export * from "./types";
export { saarestik };

export const TRACKS: Partial<Record<TrackId, TrackDef>> = {
  saarestik,
};

export function getTrack(id: TrackId): TrackDef {
  const t = TRACKS[id];
  if (!t) throw new Error(`Tundmatu rada: ${id}`);
  return t;
}
