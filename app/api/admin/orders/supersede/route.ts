import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isOrderId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

async function getOrderDetails(orderId: number) {
  const result = await db.execute({
    sql: `
      SELECT id, name, phone, phone2, duplicate_status, duplicate_of
      FROM orders
      WHERE id = ?
    `,
    args: [orderId],
  });
  const order = result.rows[0];
  if (!order) return null;

  const itemsResult = await db.execute({
    sql: `
      SELECT product_id, product_name, color, size, qty
      FROM order_items
      WHERE order_id = ?
      ORDER BY id
    `,
    args: [orderId],
  });

  return {
    id: Number(order.id),
    name: String(order.name ?? ""),
    phone: String(order.phone ?? ""),
    phone2: String(order.phone2 ?? ""),
    duplicate_status: String(order.duplicate_status),
    duplicate_of: order.duplicate_of == null ? null : Number(order.duplicate_of),
    items: itemsResult.rows.map((item) => ({
      product_id: String(item.product_id),
      product_name: String(item.product_name ?? ""),
      color: String(item.color),
      size: String(item.size),
      qty: Number(item.qty),
    })),
  };
}

export async function GET(req: NextRequest) {
  const orderId = Number(req.nextUrl.searchParams.get("orderId"));
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const order = await getOrderDetails(orderId);
    if (!order) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(order);
  } catch (error) {
    console.error("Order supersede lookup failed:", error);
    return NextResponse.json({ error: "request_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
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

  const input = body as Record<string, unknown>;
  const orderId = input.orderId;
  if (!isOrderId(orderId)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const restore = input.action === "restore";
  if (restore ? input.action !== "restore" : !isOrderId(input.keepOrderId)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (input.action !== undefined && !restore) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!restore && input.keepOrderId === orderId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let tx: Awaited<ReturnType<typeof db.transaction>> | null = null;
  try {
    tx = await db.transaction("write");
    const currentResult = await tx.execute({
      sql: `
        SELECT duplicate_status, duplicate_of, exported_at, export_batch_id
        FROM orders
        WHERE id = ?
      `,
      args: [orderId],
    });
    const current = currentResult.rows[0];
    if (!current) {
      await tx.rollback();
      tx = null;
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const previousStatus = String(current.duplicate_status);
    const previousDuplicateOf =
      current.duplicate_of == null ? null : Number(current.duplicate_of);
    const isExported =
      current.exported_at != null || current.export_batch_id != null;

    if (restore) {
      if (previousStatus !== "confirmed_duplicate" || isExported) {
        await tx.rollback();
        tx = null;
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }

      const updated = await tx.execute({
        sql: `
          UPDATE orders
          SET duplicate_status = 'confirmed_new', duplicate_of = NULL
          WHERE id = ? AND duplicate_status = 'confirmed_duplicate'
            AND exported_at IS NULL AND export_batch_id IS NULL
        `,
        args: [orderId],
      });
      if (updated.rowsAffected !== 1) {
        await tx.rollback();
        tx = null;
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      await tx.execute({
        sql: `
          INSERT INTO order_review_history (
            order_id, previous_status, new_status, previous_duplicate_of,
            duplicate_of, reviewed_by
          ) VALUES (?, ?, 'confirmed_new', ?, NULL, 'admin')
        `,
        args: [orderId, previousStatus, previousDuplicateOf],
      });
      await tx.commit();
      tx = null;
      return NextResponse.json({
        ok: true,
        orderId,
        status: "confirmed_new",
        duplicateOf: null,
      });
    }

    if (
      (previousStatus !== "normal" && previousStatus !== "confirmed_new") ||
      isExported
    ) {
      await tx.rollback();
      tx = null;
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }

    const keepOrderId = input.keepOrderId as number;
    const keepResult = await tx.execute({
      sql: "SELECT duplicate_status FROM orders WHERE id = ?",
      args: [keepOrderId],
    });
    const keepOrder = keepResult.rows[0];
    if (!keepOrder) {
      await tx.rollback();
      tx = null;
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (
      String(keepOrder.duplicate_status) !== "normal" &&
      String(keepOrder.duplicate_status) !== "confirmed_new"
    ) {
      await tx.rollback();
      tx = null;
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }

    const updated = await tx.execute({
      sql: `
        UPDATE orders
        SET duplicate_status = 'confirmed_duplicate', duplicate_of = ?
        WHERE id = ? AND duplicate_status IN ('normal', 'confirmed_new')
          AND exported_at IS NULL AND export_batch_id IS NULL
      `,
      args: [keepOrderId, orderId],
    });
    if (updated.rowsAffected !== 1) {
      await tx.rollback();
      tx = null;
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }
    await tx.execute({
      sql: `
        INSERT INTO order_review_history (
          order_id, previous_status, new_status, previous_duplicate_of,
          duplicate_of, reviewed_by
        ) VALUES (?, ?, 'confirmed_duplicate', ?, ?, 'admin')
      `,
      args: [orderId, previousStatus, previousDuplicateOf, keepOrderId],
    });

    await tx.commit();
    tx = null;
    return NextResponse.json({
      ok: true,
      orderId,
      status: "confirmed_duplicate",
      duplicateOf: keepOrderId,
    });
  } catch (error) {
    if (tx) await tx.rollback();
    console.error("Order supersede failed:", error);
    return NextResponse.json({ error: "request_failed" }, { status: 500 });
  }
}
