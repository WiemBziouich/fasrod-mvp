import { mapEtat } from "./state-map-core.mjs";
import type { NavexParcelState } from "./types";

export { mapEtat };

export function normalizeNavexState(etat: string): NavexParcelState {
  return mapEtat(etat);
}
