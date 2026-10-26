export function isDuplicateReviewSchemaMissing(error) {
  const message = String(
    error && typeof error === "object" && "message" in error
      ? error.message
      : error
  ).toLowerCase();

  return (
    (message.includes("no such column") &&
      (message.includes("duplicate_status") ||
        message.includes("duplicate_of"))) ||
    (message.includes("no such table") &&
      message.includes("order_review_history"))
  );
}
