import { NextRequest } from "next/server";
import db from "@/lib/db";
import { EXPORTABLE_ORDER_STATUSES } from "@/lib/duplicate-orders.mjs";
import { isDuplicateReviewSchemaMissing } from "@/lib/duplicate-review-errors.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Anti-injection de formules Excel + retrait des ';' et retours ligne
const cell = (v: unknown) => {
  const s = String(v ?? "").replace(/[;\r\n]+/g, " ").trim();
  return /^[=+\-@]/.test(s) ? "'" + s : s;
};

const HEADER =
  "destinataire_nom;adresse;ville;gouvernerat;telephone;telephone2;nombre_de_colis;prix;designation";

function isBatchSchemaMissing(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such (?:table|column).*?(?:export_batches|export_batch_id|import_confirmed_at)/i.test(
    message
  );
}

function csvResponse(body: string, filename: string, batchId?: number) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      ...(batchId ? { "X-Export-Batch": String(batchId) } : {}),
    },
  });
}

function toCsv(rows: Record<string, unknown>[]) {
  const lines = rows.map((o) =>
    [
      o.name,
      o.address,
      o.city,
      o.governorate,
      o.phone,
      o.phone2,
      1,
      o.total,
      o.designation,
    ]
      .map(cell)
      .join(";")
  );
  return [HEADER, ...lines].join("\r\n");
}

function migrationRequired() {
  return Response.json(
    {
      error: "export_batch_migration_required",
      message: "Migration des lots d'export requise.",
    },
    { status: 503 }
  );
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const all = params.get("all") === "1";
  const batchParam = params.get("batch");
  const date = new Date().toISOString().slice(0, 10);

  if (batchParam !== null) {
    const batchId = Number(batchParam);
    if (!Number.isSafeInteger(batchId) || batchId <= 0) {
      return Response.json({ error: "invalid_batch" }, { status: 400 });
    }

    try {
      const result = await db.execute({
        sql: "SELECT * FROM orders WHERE export_batch_id = ? ORDER BY id",
        args: [batchId],
      });
      if (!result.rows.length) {
        return Response.json({ error: "batch_not_found" }, { status: 404 });
      }
      const rows = result.rows.map(
        (row) => row as unknown as Record<string, unknown>
      );
      return csvResponse(
        toCsv(rows),
        `commandes-lot-${batchId}.csv`,
        batchId
      );
    } catch (error) {
      if (isBatchSchemaMissing(error)) return migrationRequired();
      console.error("Navex batch re-download failed:", error);
      return Response.json({ error: "export_failed" }, { status: 500 });
    }
  }

  let tx: Awaited<ReturnType<typeof db.transaction>> | null = null;
  try {
    tx = await db.transaction("write");
    const statusPlaceholders = EXPORTABLE_ORDER_STATUSES.map(() => "?").join(", ");
    const result = await tx.execute({
      sql: `
        SELECT * FROM orders
        WHERE duplicate_status IN (${statusPlaceholders})
          ${all ? "" : "AND exported_at IS NULL"}
        ORDER BY id
      `,
      args: [...EXPORTABLE_ORDER_STATUSES],
    });
    const rows = result.rows.map((row) => row as unknown as Record<string, unknown>);

    let batchId: number | undefined;
    if (!all && rows.length) {
      const insertedBatch = await tx.execute({
        sql: "INSERT INTO export_batches (order_count) VALUES (?)",
        args: [rows.length],
      });
      batchId = Number(insertedBatch.lastInsertRowid);
      const ids = rows.map((row) => Number(row.id));
      const placeholders = ids.map(() => "?").join(", ");
      await tx.execute({
        sql: `UPDATE orders
              SET exported_at = datetime('now'), export_batch_id = ?
              WHERE id IN (${placeholders})`,
        args: [batchId, ...ids],
      });
    }
    await tx.commit();

    const filename = batchId
      ? `commandes-${date}-lot-${batchId}.csv`
      : `commandes-${date}.csv`;
    return csvResponse(toCsv(rows), filename, batchId);
  } catch (error) {
    if (tx) await tx.rollback();
    if (isDuplicateReviewSchemaMissing(error)) {
      return Response.json(
        {
          error: "duplicate_review_migration_required",
          message: "Export indisponible : la migration de revue des doublons est requise.",
        },
        { status: 503 }
      );
    }
    if (isBatchSchemaMissing(error)) return migrationRequired();
    console.error("Navex export failed:", error);
    return Response.json({ error: "export_failed" }, { status: 500 });
  }
}
