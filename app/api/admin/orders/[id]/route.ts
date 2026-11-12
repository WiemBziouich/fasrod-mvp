import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { DELIVERY_FEE } from "@/lib/data";
import { validateOrderInput } from "@/lib/order-input";
import { formatOrderDesignation } from "@/lib/order-designation.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function isMissingEditSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table:\s*order_edit_log/i.test(message);
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const contentType = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { id } = await context.params;
  const orderId = Number(id);
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
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

  const validated = await validateOrderInput(body as Record<string, unknown>);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { name, address, city, governorate, phone, phone2, items } =
    validated.value;
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal + DELIVERY_FEE;
  const designation = formatOrderDesignation(items);
  const qty = items.reduce((sum, item) => sum + item.qty, 0);

  let tx: Awaited<ReturnType<typeof db.transaction>> | null = null;
  try {
    tx = await db.transaction("write");
    const currentResult = await tx.execute({
      sql: "SELECT * FROM orders WHERE id = ?",
      args: [orderId],
    });
    const current = currentResult.rows[0];
    if (!current) {
      await tx.rollback();
      tx = null;
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const status = String(current.duplicate_status);
    if (
      current.exported_at != null ||
      current.export_batch_id != null ||
      String(current.review_decision ?? "") === "rejected" ||
      !["normal", "confirmed_new", "pending_review"].includes(status)
    ) {
      await tx.rollback();
      tx = null;
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }

    const oldItemsResult = await tx.execute({
      sql: `
        SELECT product_id, product_name, color, size, qty, unit_price, line_total
        FROM order_items
        WHERE order_id = ?
        ORDER BY id
      `,
      args: [orderId],
    });
    const before = {
      name: String(current.name ?? ""),
      address: String(current.address ?? ""),
      city: String(current.city ?? ""),
      governorate: String(current.governorate ?? ""),
      phone: String(current.phone ?? ""),
      phone2: String(current.phone2 ?? ""),
      product_id: String(current.product_id ?? ""),
      designation: String(current.designation ?? ""),
      qty: Number(current.qty ?? 0),
      item_price: Number(current.item_price ?? 0),
      delivery_fee: Number(current.delivery_fee ?? 0),
      total: Number(current.total ?? 0),
      duplicate_status: status,
      duplicate_of:
        current.duplicate_of == null ? null : Number(current.duplicate_of),
      items: oldItemsResult.rows.map((item) => ({
        product_id: String(item.product_id),
        product_name: String(item.product_name ?? ""),
        color: String(item.color),
        size: String(item.size),
        qty: Number(item.qty),
        unit_price: Number(item.unit_price),
        line_total: Number(item.line_total),
      })),
    };
    const after = {
      name,
      address,
      city,
      governorate,
      phone,
      phone2,
      product_id: items[0].productId,
      designation,
      qty,
      item_price: subtotal,
      delivery_fee: DELIVERY_FEE,
      total,
      duplicate_status: status,
      duplicate_of:
        current.duplicate_of == null ? null : Number(current.duplicate_of),
      items: items.map((item) => ({
        product_id: item.productId,
        product_name: item.productName,
        color: item.color,
        size: item.size,
        qty: item.qty,
        unit_price: item.unitPrice,
        line_total: item.lineTotal,
      })),
    };

    const updated = await tx.execute({
      sql: `
        UPDATE orders
        SET name = ?, address = ?, city = ?, governorate = ?, phone = ?,
            phone2 = ?, product_id = ?, designation = ?, qty = ?,
            item_price = ?, delivery_fee = ?, total = ?
        WHERE id = ? AND exported_at IS NULL AND export_batch_id IS NULL
          AND duplicate_status IN ('normal', 'confirmed_new', 'pending_review')
      `,
      args: [
        name,
        address,
        city,
        governorate,
        phone,
        phone2,
        after.product_id,
        designation,
        qty,
        subtotal,
        DELIVERY_FEE,
        total,
        orderId,
      ],
    });
    if (updated.rowsAffected !== 1) {
      await tx.rollback();
      tx = null;
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }

    await tx.execute({
      sql: "DELETE FROM order_items WHERE order_id = ?",
      args: [orderId],
    });
    for (const item of items) {
      await tx.execute({
        sql: `
          INSERT INTO order_items (
            order_id, product_id, product_name, color, size,
            qty, unit_price, line_total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          orderId,
          item.productId,
          item.productName,
          item.color,
          item.size,
          item.qty,
          item.unitPrice,
          item.lineTotal,
        ],
      });
    }
    await tx.execute({
      sql: `
        INSERT INTO order_edit_log (order_id, before_json, after_json)
        VALUES (?, ?, ?)
      `,
      args: [orderId, JSON.stringify(before), JSON.stringify(after)],
    });

    await tx.commit();
    tx = null;
    return NextResponse.json({ ok: true, orderId, subtotal, deliveryFee: DELIVERY_FEE, total });
  } catch (error) {
    if (tx) await tx.rollback();
    if (isMissingEditSchema(error)) {
      return NextResponse.json(
        { error: "order_edit_migration_required" },
        { status: 503 }
      );
    }
    console.error("Order edit failed:", error);
    return NextResponse.json({ error: "request_failed" }, { status: 500 });
  }
}
