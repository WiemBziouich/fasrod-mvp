const API_ORIGIN = "https://app.navex.tn";
const BATCH_SIZE = 20;
const TIMEOUT_MS = 10_000;

function isStringOrNull(value) {
  return value === null || typeof value === "string";
}

function validateResponse(body, requestedCodes) {
  if (
    !body ||
    typeof body !== "object" ||
    body.status !== 1 ||
    !Number.isInteger(body.total) ||
    !Array.isArray(body.results)
  ) {
    throw new Error("navex_bad_response");
  }
  const requested = new Set(requestedCodes);
  const results = [];
  for (const item of body.results) {
  if (
    !item ||
    typeof item !== "object" ||
    typeof item.code !== "string" ||
    !requested.has(item.code)
  ) {
    continue;
  }
  if (
    ![0, 1].includes(item.status) ||
    typeof item.etat !== "string" ||
    typeof item.status_message !== "string"
  ) {
    throw new Error("navex_bad_response");
  }
  if (item.status === 0) {
    results.push({
      status: 0,
      code: item.code,
      etat: item.etat,
      status_message: item.status_message,
    });
    continue;
  }
  if (
    ["motif", "pre_etat", "pre_motif"].some(
      (key) => item[key] !== undefined && !isStringOrNull(item[key])
    )
  ) {
    throw new Error("navex_bad_response");
  }
  results.push({
    status: 1,
    code: item.code,
    etat: item.etat,
    status_message: item.status_message,
    motif: item.motif ?? null,
    pre_etat: item.pre_etat ?? null,
    pre_motif: item.pre_motif ?? null,
  });
  }
  if (new Set(results.map((result) => result.code)).size !== results.length) {
  throw new Error("navex_bad_response");
  }
  return results;
}

async function postBatch(token, codes, fetchImpl, timeoutMs) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(
        `${API_ORIGIN}/api/${encodeURIComponent(token)}/v1/post.php`,
        {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: `codes=${encodeURIComponent(codes.join(", "))}`,
          signal: controller.signal,
        }
      );
      if (response.status === 401 || response.status === 403) {
        throw new Error("navex_auth");
      }
      if (response.status >= 500) {
        if (attempt === 0) continue;
        throw new Error("navex_network");
      }
      if (!response.ok) throw new Error("navex_bad_response");
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error("navex_bad_response");
      }
      return validateResponse(payload, codes);
    } catch (error) {
      if (error instanceof Error && error.message === "navex_auth") throw error;
      if (error instanceof Error && error.message === "navex_bad_response") {
        throw error;
      }
      if (controller.signal.aborted) throw new Error("navex_timeout");
      if (attempt === 1) throw new Error("navex_network");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("navex_network");
}

export async function getStatesWithFetch(
  codes,
  token,
  fetchImpl = globalThis.fetch,
  timeoutMs = TIMEOUT_MS
) {
  if (!token) throw new Error("navex_not_configured");
  if (!Array.isArray(codes) || codes.some((code) => typeof code !== "string" || !code)) {
    throw new Error("navex_bad_response");
  }
  const results = [];
  for (let offset = 0; offset < codes.length; offset += BATCH_SIZE) {
    const batch = codes.slice(offset, offset + BATCH_SIZE);
    results.push(...await postBatch(token, batch, fetchImpl, timeoutMs));
  }
  return results;
}

export { API_ORIGIN };
