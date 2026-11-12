export function createReviewReasonColumnCache(
  query: () => Promise<boolean>,
  options?: { ttlMs?: number; now?: () => number }
): () => Promise<boolean>;
