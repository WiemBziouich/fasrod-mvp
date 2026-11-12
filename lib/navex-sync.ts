import db from "@/lib/db";
import { refreshParcelStatesWithDb } from "@/lib/navex-sync-core.mjs";
import type { NavexClient } from "@/lib/navex/client";

export function refreshParcelStates(
  client: NavexClient,
  options: { now?: Date } = {}
) {
  return refreshParcelStatesWithDb(client, db, options);
}
