import type { NavexClient, NavexStateResult } from "./client";
export class FakeNavexClient implements NavexClient {
  constructor(results: NavexStateResult[]);
  getStates(codes: string[]): Promise<NavexStateResult[]>;
}
