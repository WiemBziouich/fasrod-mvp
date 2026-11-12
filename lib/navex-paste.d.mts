import type { NavexParcelState } from "./navex/types";
export function parseNavexPaste(
  text: string,
  stateRaw: string
): {
  parcels: {
    code: string;
    phone: string;
    phone2: string;
    state: NavexParcelState;
    stateRaw: string;
    motif: string;
    parcelDate: string | null;
  }[];
  ignoredCount: number;
};
export function maskNavexPhone(phone: string): string;
export function findUniqueRecentExport(
  phone: string,
  phone2: string,
  recentOrders: Record<string, unknown>[]
): number | null;
