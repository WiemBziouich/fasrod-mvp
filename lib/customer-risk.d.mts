export function decideCustomerReview(options: {
  sameBasket?: boolean;
  recentPhone?: boolean;
  recentExport?: boolean;
  openParcel?: boolean;
  recentReturn?: boolean;
  flaggedPhone?: boolean;
}): {
  reasons: string[];
  reason: string;
  duplicateStatus: "pending_review" | "normal";
};
export function isOpenParcelRisk(
  parcel: { state: string; motif: string; date: string | null },
  options: {
    openStates: readonly string[];
    ignoredMotif: RegExp;
    days: number;
    now?: number;
  }
): boolean;
export function getParcelReviewSignals<
  T extends { state: string; motif: string; date: string | null }
>(
  parcels: T[],
  options: {
    openStates: readonly string[];
    ignoredMotif: RegExp;
    openDays: number;
    returnDays: number;
    now?: number;
  }
): {
  openParcels: T[];
  recentReturns: T[];
};
