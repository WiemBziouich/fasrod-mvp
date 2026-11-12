import { NextResponse } from "next/server";
import db from "@/lib/db";
import { ConfiguredNavexClient, isNavexConfigured } from "@/lib/navex/client";
import { refreshParcelStates } from "@/lib/navex-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const [syncState, counts, otherRawCounts] = await Promise.all([
      db.execute("SELECT last_sync_at, last_status, last_count, last_error FROM navex_sync_state WHERE id = 1"),
      db.execute("SELECT state, COUNT(*) AS count FROM navex_parcels GROUP BY state"),
      db.execute(`
        SELECT state_raw, COUNT(*) AS count
        FROM navex_parcels
        WHERE state = 'other'
        GROUP BY state_raw
        ORDER BY count DESC, state_raw
      `),
    ]);
    return NextResponse.json({
      configured: isNavexConfigured(),
      sync: syncState.rows[0] ?? null,
      counts: counts.rows,
      otherRawCounts: otherRawCounts.rows,
    });
  } catch {
    return NextResponse.json({ error: "navex_status_failed" }, { status: 500 });
  }
}

export async function POST() {
  if (!isNavexConfigured()) {
    return NextResponse.json({ skipped: true });
  }
  try {
    const syncState = await db.execute(`
      SELECT CASE
        WHEN datetime(last_sync_at) >= datetime('now', '-60 seconds')
         AND datetime(last_sync_at) <= datetime('now')
        THEN 1
        ELSE 0
      END AS is_recent
      FROM navex_sync_state
      WHERE id = 1
    `);
    if (Number(syncState.rows[0]?.is_recent ?? 0) === 1) {
      return NextResponse.json({ skipped: true, reason: "recent" });
    }
    const result = await refreshParcelStates(new ConfiguredNavexClient());
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = [
      "navex_not_configured",
      "navex_auth",
      "navex_bad_response",
      "navex_timeout",
      "navex_network",
    ].includes(message)
      ? message
      : "navex_network";
    return NextResponse.json({ error: code }, { status: 502 });
  }
}
