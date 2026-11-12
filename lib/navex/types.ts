export type NavexParcelState =
  | "pending"
  | "depot"
  | "in_transit"
  | "delivered"
  | "returned"
  | "to_verify"
  | "exchange"
  | "unserious"
  | "other";

export type NavexParcel = {
  code: string;
  phone: string;
  phone2: string;
  state: NavexParcelState;
  stateRaw: string;
  motif: string | null;
  parcelDate: string | null;
};
