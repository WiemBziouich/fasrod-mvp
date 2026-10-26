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

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get("all") === "1";
  const tx = await db.transaction("write");

  try {
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
    const header =
      "destinataire_nom;adresse;ville;gouvernerat;telephone;telephone2;nombre_de_colis;prix;designation";
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

    if (!all && rows.length) {
      for (const o of rows) {
        await tx.execute({
          sql: "UPDATE orders SET exported_at = datetime('now') WHERE id = ?",
          args: [Number(o.id)],
        });
      }
    }
    await tx.commit();

    const date = new Date().toISOString().slice(0, 10);
    return new Response([header, ...lines].join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="commandes-${date}.csv"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    await tx.rollback();
    if (isDuplicateReviewSchemaMissing(error)) {
      return Response.json(
        {
          error: "duplicate_review_migration_required",
          message: "Export indisponible : la migration de revue des doublons est requise.",
        },
        { status: 503 }
      );
    }
    console.error("Navex export failed:", error);
    return Response.json({ error: "export_failed" }, { status: 500 });
  }
}
