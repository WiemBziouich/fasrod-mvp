function createCachedValue(query, normalize, onError, { ttlMs, now }) {
  let cachedValue = null;
  let expiresAt = 0;
  let pendingQuery = null;

  return function getCachedValue() {
    if (cachedValue !== null && now() < expiresAt) {
      return Promise.resolve(cachedValue);
    }
    if (pendingQuery) return pendingQuery;

    pendingQuery = Promise.resolve()
      .then(query)
      .then((value) => {
        cachedValue = normalize(value);
        expiresAt = now() + ttlMs;
        return cachedValue;
      })
      .catch(() => {
        cachedValue = null;
        expiresAt = 0;
        return onError();
      })
      .finally(() => {
        pendingQuery = null;
      });
    return pendingQuery;
  };
}

export function createReviewReasonColumnCache(
  query,
  { ttlMs = 60_000, now = Date.now } = {}
) {
  return createCachedValue(query, Boolean, () => false, { ttlMs, now });
}

export function createOrderColumnCache(
  query,
  { ttlMs = 60_000, now = Date.now } = {}
) {
  const getColumns = createCachedValue(
    query,
    (columns) => new Set(columns.map(String)),
    () => new Set(),
    { ttlMs, now }
  );

  return async function hasOrderColumn(name) {
    return (await getColumns()).has(name);
  };
}
