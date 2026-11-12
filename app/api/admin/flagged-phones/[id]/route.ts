import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  if (
    req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) {
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
    typeof (body as Record<string, unknown>).active !== "boolean"
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const result = await db.execute({
      sql: "UPDATE flagged_phones SET active = ? WHERE id = ?",
      args: [(body as { active: boolean }).active ? 1 : 0, id],
    });
    if (result.rowsAffected !== 1) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ error: "request_failed" }, { status: 500 });
  }
}
