import type { NavexClient } from "./navex/client";
export function refreshParcelStatesWithDb(
  client: NavexClient,
  database: typeof import("./db").default,
  options?: { now?: Date; clock?: () => number }
): Promise<{
  processed: number;
  updated: number;
  notFound: number;
  truncated?: true;
}>;
