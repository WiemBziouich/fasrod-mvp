export type NavexStateResult = {
  status: 0 | 1;
  code: string;
  etat: string;
  status_message: string;
  motif?: string | null;
  pre_etat?: string | null;
  pre_motif?: string | null;
};
export function getStatesWithFetch(
  codes: string[],
  token: string | undefined,
  fetchImpl?: typeof fetch,
  timeoutMs?: number
): Promise<NavexStateResult[]>;
export const API_ORIGIN: "https://app.navex.tn";
