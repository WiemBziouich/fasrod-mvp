import { mapEtat } from "./navex/state-map-core.mjs";

const MAX_PARCELS = 100;
const API_BATCH_SIZE = 20;
const TIME_BUDGET_MS = 30_000;

function shortErrorCode(error) {
  const message = error instanceof Error ? error.message : "";
  return [
    "navex_not_configured",
    "navex_auth",
    "navex_bad_response",
    "navex_timeout",
    "navex_network",
  ].includes(message)
    ? message
    : "navex_network";
}

export async function refreshParcelStatesWithDb(client, database, options = {}) {
  const now = options.now ?? new Date();
  const clock = options.clock ?? Date.now;
  const startedAt = clock();
  const selected = await database.execute({
    sql: `
      SELECT code
      FROM navex_parcels
      WHERE datetime(COALESCE(parcel_date, first_seen_at)) >= datetime('now', '-60 days')
        AND (
          state NOT IN ('delivered', 'returned', 'unserious')
          OR (
            state = 'delivered'
            AND datetime(state_changed_at) >= datetime('now', '-3 days')
          )
          OR (
            state IN ('returned', 'unserious')
            AND datetime(state_changed_at) >= datetime('now', '-14 days')
          )
        )
      ORDER BY datetime(updated_at) ASC
      LIMIT ${MAX_PARCELS}
    `,
  });
  const codes = selected.rows.map((row) => String(row.code));
  let processed = 0;
  let notFound = 0;
  let updated = 0;
  let truncated = false;
  for (let offset = 0; offset < codes.length; offset += API_BATCH_SIZE) {
    if (clock() - startedAt > TIME_BUDGET_MS) {
      truncated = true;
      break;
    }
    const batchCodes = codes.slice(offset, offset + API_BATCH_SIZE);
    let results;
    try {
      results = await client.getStates(batchCodes);
    } catch (error) {
      await recordSync(database, now, "error", updated, shortErrorCode(error));
      throw new Error(shortErrorCode(error));
    }
    processed += batchCodes.length;
    notFound += results.filter((result) => result.status === 0).length;
    const updates = results
      .filter((result) => result.status === 1 && batchCodes.includes(result.code))
      .map((result) => ({
        code: result.code,
        state: mapEtat(result.etat, result.motif),
        stateRaw: result.etat,
        motif: result.motif ?? "",
      }));
    const tx = await database.transaction("write");
    try {
      for (const parcel of updates) {
        await tx.execute({
          sql: `
            UPDATE navex_parcels
            SET state = ?,
                state_changed_at = CASE
                  WHEN state <> ? THEN datetime('now')
                  ELSE state_changed_at
                END,
                state_raw = ?,
                motif = ?,
                updated_at = datetime('now')
            WHERE code = ?
          `,
          args: [
            parcel.state,
            parcel.state,
            parcel.stateRaw,
            parcel.motif,
            parcel.code,
          ],
        });
      }
      const updatedCodes = new Set(updates.map((parcel) => parcel.code));
      const notUpdatedCodes = batchCodes.filter(
        (code) => !updatedCodes.has(code)
      );
      if (notUpdatedCodes.length) {
        const placeholders = notUpdatedCodes.map(() => "?").join(", ");
        await tx.execute({
          sql: `
            UPDATE navex_parcels
            SET updated_at = datetime('now')
            WHERE code IN (${placeholders})
          `,
          args: notUpdatedCodes,
        });
      }
      await tx.commit();
      updated += updates.length;
    } catch {
      await tx.rollback();
      await recordSync(database, now, "error", updated, "navex_network");
      throw new Error("navex_network");
    }
  }
  await recordSync(database, now, truncated ? "truncated" : "success", updated, "");
  return { processed, updated, notFound, ...(truncated ? { truncated: true } : {}) };
}

async function recordSync(database, date, status, count, error) {
  await database.execute({
    sql: `
      INSERT INTO navex_sync_state (id, last_sync_at, last_status, last_count, last_error)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_sync_at = excluded.last_sync_at,
        last_status = excluded.last_status,
        last_count = excluded.last_count,
        last_error = excluded.last_error
    `,
    args: [date.toISOString(), status, count, error],
  });
}
