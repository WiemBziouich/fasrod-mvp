export function createReviewReasonColumnCache(
  query: () => Promise<boolean>,
  options?: { ttlMs?: number; now?: () => number }
): () => Promise<boolean>;

export function createOrderColumnCache(
  query: () => Promise<string[]>,
  options?: { ttlMs?: number; now?: () => number }
): (name: string) => Promise<boolean>;
