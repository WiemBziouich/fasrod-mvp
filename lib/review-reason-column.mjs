export function createReviewReasonColumnCache(
  query,
  { ttlMs = 60_000, now = Date.now } = {}
) {
  let cachedValue = null;
  let expiresAt = 0;
  let pendingQuery = null;

  return function hasReviewReasonColumn() {
    if (cachedValue !== null && now() < expiresAt) {
      return Promise.resolve(cachedValue);
    }
    if (pendingQuery) return pendingQuery;

    pendingQuery = Promise.resolve()
      .then(query)
      .then((value) => {
        cachedValue = Boolean(value);
        expiresAt = now() + ttlMs;
        return cachedValue;
      })
      .catch(() => {
        cachedValue = null;
        expiresAt = 0;
        return false;
      })
      .finally(() => {
        pendingQuery = null;
      });
    return pendingQuery;
  };
}
