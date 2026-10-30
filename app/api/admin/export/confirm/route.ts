import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBatchSchemaMissing(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such (?:table|column).*?(?:export_batches|export_batch_id|import_confirmed_at)/i.test(
    message
  );
}

export async function POST(req: NextRequest) {
  const contentType = req.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ error: "invalid_content_type" }, { status: 415 });
  }

  const body = await req.json().catch(() => null);
  const batchId = Number(body?.batchId);
  if (!Number.isSafeInteger(batchId) || batchId <= 0) {
    return NextResponse.json({ error: "invalid_batch" }, { status: 400 });
  }

  let tx: Awaited<ReturnType<typeof db.transaction>> | null = null;
  try {
    tx = await db.transaction("write");
    const batch = await tx.execute({
      sql: "SELECT id FROM export_batches WHERE id = ?",
      args: [batchId],
    });
    if (!batch.rows.length) {
      await tx.rollback();
      return NextResponse.json({ error: "batch_not_found" }, { status: 404 });
    }

    const updatedOrders = await tx.execute({
      sql: `
        UPDATE orders
        SET import_confirmed_at = datetime('now')
        WHERE export_batch_id = ? AND import_confirmed_at IS NULL
      `,
      args: [batchId],
    });
    await tx.execute({
      sql: `
        UPDATE export_batches
        SET confirmed_at = datetime('now')
        WHERE id = ? AND confirmed_at IS NULL
      `,
      args: [batchId],
    });
    await tx.commit();

    return NextResponse.json({
      ok: true,
      confirmed: Number(updatedOrders.rowsAffected),
    });
  } catch (error) {
    if (tx) await tx.rollback();
    if (isBatchSchemaMissing(error)) {
      return NextResponse.json(
        {
          error: "export_batch_migration_required",
          message: "Migration des lots d'export requise.",
        },
        { status: 503 }
      );
    }
    console.error("Batch confirm failed:", error);
    return NextResponse.json({ error: "confirm_failed" }, { status: 500 });
  }
}
