import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isProductSortOrderMissing } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  const contentType = req.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ error: "invalid_content_type" }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    body === null ||
    typeof body !== "object" ||
    !("ids" in body) ||
    !Array.isArray(body.ids) ||
    body.ids.length > 500 ||
    body.ids.some((id: unknown) => typeof id !== "string")
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const ids = body.ids as string[];
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "products_changed" }, { status: 409 });
  }

  let tx: Awaited<ReturnType<typeof db.transaction>> | null = null;
  try {
    tx = await db.transaction("write");
    const result = await tx.execute("SELECT id FROM products");
    const existingIds = result.rows.map((row) => String(row.id));
    const requestedIds = new Set(ids);
    if (
      existingIds.length !== ids.length ||
      existingIds.some((id) => !requestedIds.has(id))
    ) {
      await tx.rollback();
      return NextResponse.json({ error: "products_changed" }, { status: 409 });
    }

    for (const [position, id] of ids.entries()) {
      await tx.execute({
        sql: "UPDATE products SET sort_order = ? WHERE id = ?",
        args: [(position + 1) * 10, id],
      });
    }
    await tx.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (tx) await tx.rollback();
    if (isProductSortOrderMissing(error)) {
      return NextResponse.json(
        {
          error: "product_sort_order_migration_required",
          message: "La migration de l'ordre des produits est requise.",
        },
        { status: 503 }
      );
    }
    console.error("PUT products reorder failed:", error);
    return NextResponse.json({ error: "reorder_failed" }, { status: 500 });
  }
}
