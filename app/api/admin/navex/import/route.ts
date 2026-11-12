import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import {
  findUniqueRecentExport,
  parseNavexPaste,
} from "@/lib/navex-paste.mjs";
import { ConfiguredNavexClient, isNavexConfigured } from "@/lib/navex/client";
import { PAGE_STATES } from "@/lib/navex/page-states.mjs";
import { refreshParcelStates } from "@/lib/navex-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const allowedPageStates = new Set<string>(PAGE_STATES);

export async function POST(req: NextRequest) {
  if (
    req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof (body as Record<string, unknown>).text !== "string" ||
    typeof (body as Record<string, unknown>).stateRaw !== "string" ||
    (body as { text: string }).text.length > 500_000 ||
    !allowedPageStates.has((body as { stateRaw: string }).stateRaw)
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const text = (body as { text: string }).text;
  const stateRaw = (body as { stateRaw: string }).stateRaw;
  const parsed = parseNavexPaste(text, stateRaw);
  if (parsed.parcels.length + parsed.ignoredCount > 1000) {
    return NextResponse.json({ error: "too_many" }, { status: 400 });
  }
  if (!parsed.parcels.length) {
    return NextResponse.json({
      imported: 0,
      ignored: parsed.ignoredCount,
      processed: 0,
      updated: 0,
      notFound: 0,
    });
  }

  let recentOrders;
  try {
    const capturedNow = new Date().toISOString();
    recentOrders = await db.execute({
      sql: `
      SELECT id, phone, phone2
      FROM orders
      WHERE exported_at IS NOT NULL
        AND datetime(exported_at) >= datetime(?, '-21 days')
        AND datetime(exported_at) <= datetime(?)
    `,
      args: [capturedNow, capturedNow],
    });
  } catch {
    return NextResponse.json({ error: "navex_import_failed" }, { status: 500 });
  }
  const orderIdsByCode = new Map(
    parsed.parcels.map((parcel) => [
      parcel.code,
      findUniqueRecentExport(
        parcel.phone,
        parcel.phone2,
        recentOrders.rows
      ),
    ])
  );
  const statements = parsed.parcels.map((parcel) => ({
    sql: `
      INSERT INTO navex_parcels (
        code, phone, phone2, state, state_raw, motif, parcel_date, order_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        phone = excluded.phone,
        phone2 = excluded.phone2,
        state = excluded.state,
        state_raw = excluded.state_raw,
        motif = COALESCE(NULLIF(excluded.motif, ''), navex_parcels.motif),
        parcel_date = COALESCE(excluded.parcel_date, navex_parcels.parcel_date),
        order_id = COALESCE(excluded.order_id, navex_parcels.order_id),
        updated_at = datetime('now')
    `,
    args: [
      parcel.code,
      parcel.phone,
      parcel.phone2,
      parcel.state,
      parcel.stateRaw,
      parcel.motif,
      parcel.parcelDate,
      orderIdsByCode.get(parcel.code) ?? null,
    ],
  }));
  let batchesWritten = 0;
  for (let offset = 0; offset < statements.length; offset += 100) {
    try {
      await db.batch(statements.slice(offset, offset + 100), "write");
      batchesWritten += 1;
    } catch {
      return NextResponse.json(
        { error: "navex_import_failed", batchesWritten },
        { status: 500 }
      );
    }
  }
  const imported = parsed.parcels.length;

  if (!isNavexConfigured()) {
    return NextResponse.json({
      imported,
      ignored: parsed.ignoredCount,
      processed: 0,
      updated: 0,
      notFound: 0,
    });
  }
  try {
    const result = await refreshParcelStates(new ConfiguredNavexClient());
    return NextResponse.json({
      imported,
      ignored: parsed.ignoredCount,
      processed: result.processed,
      updated: result.updated,
      notFound: result.notFound,
    });
  } catch (error) {
    return NextResponse.json({
      imported,
      ignored: parsed.ignoredCount,
      processed: 0,
      updated: 0,
      notFound: 0,
      syncError: shortNavexError(error),
    });
  }
}

function shortNavexError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return [
    "navex_not_configured",
    "navex_auth",
    "navex_bad_response",
    "navex_timeout",
    "navex_network",
  ].includes(code)
    ? code
    : "navex_network";
}

