import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { normalizeTunisiaPhone } from "@/lib/duplicate-orders.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const REASONS = new Set(["retour", "refus", "injoignable", "autre"]);
type PreparedEntry = { phone: string; reason: string; note: string };

function validPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return normalizeTunisiaPhone(value);
}

function validRequest(req: NextRequest) {
  return req.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase() === "application/json";
}

export async function GET() {
  try {
    const result = await db.execute(
      "SELECT id, phone, reason, note, created_at, active FROM flagged_phones ORDER BY active DESC, created_at DESC"
    );
    return NextResponse.json({ phones: result.rows });
  } catch {
    return NextResponse.json({ error: "request_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validRequest(req)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const entries = Array.isArray(record.entries) ? record.entries : [record];
  if (!entries.length || entries.length > 500) {
    return NextResponse.json({ error: "invalid_phone_count" }, { status: 400 });
  }
  const prepared = entries.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const value = entry as Record<string, unknown>;
    const phone = validPhone(value.phone);
    const reason = value.reason;
    const note = value.note === undefined ? "" : value.note;
    if (
      !phone ||
      typeof reason !== "string" ||
      !REASONS.has(reason) ||
      typeof note !== "string" ||
      note.length > 200
    ) return null;
    return { phone, reason, note } satisfies PreparedEntry;
  });
  if (prepared.some((entry) => entry === null)) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  try {
    const statements = prepared
      .filter((entry): entry is PreparedEntry => entry !== null)
      .map((entry) => ({
        sql: `INSERT INTO flagged_phones (phone, reason, note)
              VALUES (?, ?, ?)
              ON CONFLICT(phone) DO UPDATE SET
                reason = CASE
                  WHEN CASE excluded.reason
                    WHEN 'refus' THEN 4
                    WHEN 'retour' THEN 3
                    WHEN 'injoignable' THEN 2
                    ELSE 1
                  END > CASE flagged_phones.reason
                    WHEN 'refus' THEN 4
                    WHEN 'retour' THEN 3
                    WHEN 'injoignable' THEN 2
                    ELSE 1
                  END
                  THEN excluded.reason
                  ELSE flagged_phones.reason
                END,
                note = COALESCE(NULLIF(excluded.note, ''), flagged_phones.note),
                active = 1`,
        args: [entry.phone, entry.reason, entry.note],
      }));
    await db.batch(statements, "write");
    return NextResponse.json({ ok: true, count: prepared.length });
  } catch {
    return NextResponse.json({ error: "request_failed" }, { status: 500 });
  }
}
