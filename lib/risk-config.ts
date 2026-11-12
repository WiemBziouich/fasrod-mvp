export const EXPORTED_ORDER_REVIEW_DAYS = 14;
export const OPEN_PARCEL_REVIEW_DAYS = 21;
export const RETURN_REVIEW_DAYS = 90;
export const IGNORED_PARCEL_MOTIF = /disponible demain/i;

export const OPEN_PARCEL_STATES = [
  "pending",
  "depot",
  "in_transit",
  "to_verify",
  "exchange",
] as const;
