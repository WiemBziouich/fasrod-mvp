import { NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const tx = await db.transaction("write");

  try {
    const result = await tx.execute(`
      SELECT id
      FROM orders
      WHERE import_confirmed_at IS NOT NULL
        AND datetime(import_confirmed_at) <= datetime('now', '-30 days')
        AND duplicate_status = 'normal'
        AND duplicate_of IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM orders AS referencing_order
          WHERE referencing_order.duplicate_of = orders.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM order_review_history AS history
          WHERE history.order_id = orders.id
             OR history.previous_duplicate_of = orders.id
             OR history.duplicate_of = orders.id
        )
    `);

    const ids = (result.rows as unknown as Array<{ id: number }>).map((row) => row.id);

    if (!ids.length) {
      await tx.rollback();
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const placeholders = ids.map(() => "?").join(", ");
    await tx.execute({
      sql: `DELETE FROM order_items WHERE order_id IN (${placeholders})`,
      args: ids,
    });
    await tx.execute({
      sql: `DELETE FROM orders WHERE id IN (${placeholders})`,
      args: ids,
    });
    await tx.commit();

    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (error) {
    await tx.rollback();
    console.error("Cleanup old exported orders failed:", error);
    return NextResponse.json({ error: "cleanup_failed" }, { status: 500 });
  }
}
