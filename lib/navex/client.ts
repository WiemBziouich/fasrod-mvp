import { getStatesWithFetch } from "./client-core.mjs";
import type { NavexStateResult } from "./client-core.mjs";
export { FakeNavexClient } from "./fake-client.mjs";
export type { NavexStateResult } from "./client-core.mjs";

export interface NavexClient {
  getStates(codes: string[]): Promise<NavexStateResult[]>;
}

export class ConfiguredNavexClient implements NavexClient {
  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch) {}

  getStates(codes: string[]) {
    return getStatesWithFetch(codes, process.env.NAVEX_READ_TOKEN, this.fetchImpl);
  }
}

export function isNavexConfigured() {
  return Boolean(process.env.NAVEX_READ_TOKEN);
}
