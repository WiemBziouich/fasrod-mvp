export function decideCustomerReview({
  sameBasket = false,
  recentPhone = false,
  recentExport = false,
  openParcel = false,
  recentReturn = false,
  flaggedPhone = false,
}) {
  const reasons = [];
  if (sameBasket) reasons.push("same_basket");
  if (recentPhone) reasons.push("recent_phone");
  if (flaggedPhone) reasons.push("flagged_phone");
  if (recentReturn) reasons.push("previous_return");
  if (openParcel || recentExport) reasons.push("open_parcel");
  return {
    reasons,
    reason: reasons.join(", "),
    duplicateStatus: reasons.length ? "pending_review" : "normal",
  };
}

export function isOpenParcelRisk(
  parcel,
  { openStates, ignoredMotif, days, now = Date.now() }
) {
  if (!openStates.includes(parcel.state) || ignoredMotif.test(parcel.motif)) {
    return false;
  }
  if (!parcel.date) return false;
  const date = parcel.date.includes("T")
    ? parcel.date
    : `${parcel.date.replace(" ", "T")}Z`;
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) &&
    timestamp <= now &&
    timestamp >= now - days * 24 * 60 * 60 * 1000;
}

export function getParcelReviewSignals(
  parcels,
  { openStates, ignoredMotif, openDays, returnDays, now = Date.now() }
) {
  const isRecent = (date, days) => {
    if (!date) return false;
    const parsedDate = date.includes("T") ? date : `${date.replace(" ", "T")}Z`;
    const timestamp = Date.parse(parsedDate);
    return Number.isFinite(timestamp) &&
      timestamp <= now &&
      timestamp >= now - days * 24 * 60 * 60 * 1000;
  };
  const openParcels = parcels.filter((parcel) =>
    isOpenParcelRisk(parcel, {
      openStates,
      ignoredMotif,
      days: openDays,
      now,
    })
  );
  const recentReturns = parcels.filter(
    (parcel) =>
      ["returned", "unserious"].includes(parcel.state) &&
      !ignoredMotif.test(parcel.motif) &&
      isRecent(parcel.date, returnDays)
  );
  return { openParcels, recentReturns };
}
