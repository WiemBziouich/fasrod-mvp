
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { DELIVERY_FEE } from "@/lib/data";
import {
  basketsMatch,
  normalizeTunisiaPhone,
} from "@/lib/duplicate-orders.mjs";
import { isDuplicateReviewSchemaMissing } from "@/lib/duplicate-review-errors.mjs";
import { consumeRateLimit } from "@/lib/rate-limit";
import { validateOrderInput } from "@/lib/order-input";
import { formatOrderDesignation } from "@/lib/order-designation.mjs";
import { getCustomerHistory } from "@/lib/customer-history";
import { EXPORTED_ORDER_REVIEW_DAYS } from "@/lib/risk-config";
import { decideCustomerReview } from "@/lib/customer-risk.mjs";
import { createOrderColumnCache } from "@/lib/review-reason-column.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hasOrderColumn = createOrderColumnCache(async () => {
  const columns = await db.execute("PRAGMA table_info(orders)");
  return columns.rows.map((column) => String(column.name));
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

  // Shared IP rate limit: 40 requests per 10 minutes.
  try {
    const allowedIp = await consumeRateLimit(`ip:${ip}`, 40);

    if (!allowedIp) {
      return NextResponse.json({ error: "rate" }, { status: 429 });
    }
  } catch (error) {
    console.error("IP rate limit failed:", error);
    return NextResponse.json(
      { error: "rate_limit_unavailable" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // Honeypot: ignore automated submissions without creating an order.
  if (body.website) {
    return NextResponse.json({ ok: true, id: 0 });
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

  // Consume the phone quota only after the submitted order has been validated.
  try {
    const allowedPhone = await consumeRateLimit(`phone:${phone}`, 4);

    if (!allowedPhone) {
      return NextResponse.json({ error: "rate" }, { status: 429 });
    }
  } catch (error) {
    console.error("Phone rate limit failed:", error);
    return NextResponse.json(
      { error: "rate_limit_unavailable" },
      { status: 503 }
    );
  }

  let customerHistory = {
    orders: [],
    parcels: [],
    flaggedPhones: [],
    openParcelCount: 0,
    recentReturns: [],
    deliveredParcels: [],
  } as Awaited<ReturnType<typeof getCustomerHistory>>;
  try {
    customerHistory = await getCustomerHistory([phone, phone2]);
  } catch {
    // History is best-effort: a history read must never block order creation.
  }

  const [supportsReviewReason, supportsReviewDecision] = await Promise.all([
    hasOrderColumn("review_reason"),
    hasOrderColumn("review_decision"),
  ]);

  try {
    const tx = await db.transaction("write");

    try {
      const recentOrders = await tx.execute(`
        SELECT id, phone, phone2,
          CASE
            WHEN datetime(created_at) >= datetime('now', '-60 minutes') THEN 1
            ELSE 0
          END AS within_hour
        FROM orders
        WHERE datetime(created_at) >= datetime('now', '-30 days')
          AND duplicate_status IN ('normal', 'pending_review', 'confirmed_new')
          ${supportsReviewDecision ? "AND COALESCE(review_decision, '') <> 'rejected'" : ""}
        ORDER BY datetime(created_at) DESC, id DESC
      `);

      const submittedPhones = new Set([phone, phone2]);

      const phoneMatches = recentOrders.rows.filter((row) => {
        const candidatePhones = [
          normalizeTunisiaPhone(row.phone),
          normalizeTunisiaPhone(row.phone2),
        ].filter((candidate): candidate is string => candidate !== null);

        return candidatePhones.some((candidate) =>
          submittedPhones.has(candidate)
        );
      });
      const candidateIds = phoneMatches.map((row) => Number(row.id));
      const recentPhoneDuplicate =
        phoneMatches.find((row) => Number(row.within_hour) === 1) ?? null;

      const candidateBaskets = new Map<
        number,
        {
          product_id: string;
          color: string;
          size: string;
          qty: number;
        }[]
      >();

      for (const candidateId of candidateIds) {
        candidateBaskets.set(candidateId, []);
      }

      for (let offset = 0; offset < candidateIds.length; offset += 500) {
        const batch = candidateIds.slice(offset, offset + 500);
        const placeholders = batch.map(() => "?").join(", ");

        const candidateItems = await tx.execute({
          sql: `
            SELECT order_id, product_id, color, size, qty
            FROM order_items
            WHERE order_id IN (${placeholders})
          `,
          args: batch,
        });

        for (const row of candidateItems.rows) {
          const basket = candidateBaskets.get(Number(row.order_id));

          if (basket) {
            basket.push({
              product_id: String(row.product_id),
              color: String(row.color),
              size: String(row.size),
              qty: Number(row.qty),
            });
          }
        }
      }

      const submittedBasket = items.map((item) => ({
        product_id: item.productId,
        color: item.color,
        size: item.size,
        qty: item.qty,
      }));

      const identicalBasketOrder = candidateIds
        .slice()
        .sort((left, right) => right - left)
        .find((candidateId) =>
          basketsMatch(
            submittedBasket,
            candidateBaskets.get(candidateId) ?? []
          )
        );
      const duplicateOf =
        (recentPhoneDuplicate ? Number(recentPhoneDuplicate.id) : null) ??
        candidateIds
          .sort((left, right) => right - left)
          .find((candidateId) =>
            basketsMatch(
              submittedBasket,
              candidateBaskets.get(candidateId) ?? []
            )
          ) ??
        null;
      const hasRecentlyExportedOrder = customerHistory.orders.some((order) => {
        if (!order.exported_at) return false;
        const exportedAt = Date.parse(order.exported_at.replace(" ", "T"));
        return Number.isFinite(exportedAt) &&
          exportedAt <= Date.now() &&
          exportedAt >= Date.now() -
            EXPORTED_ORDER_REVIEW_DAYS * 24 * 60 * 60 * 1000;
      });
      const decision = decideCustomerReview({
        sameBasket: Boolean(identicalBasketOrder),
        recentPhone: Boolean(recentPhoneDuplicate),
        recentExport: hasRecentlyExportedOrder,
        openParcel: customerHistory.openParcelCount > 0,
        recentReturn: customerHistory.recentReturns.length > 0,
        flaggedPhone: customerHistory.flaggedPhones.length > 0,
      });
      const reviewReason = decision.reason;
      const duplicateStatus = decision.duplicateStatus;

      const first = items[0];

      const result = supportsReviewReason
        ? await tx.execute({
            sql: `
          INSERT INTO orders (
            name, address, city, governorate, phone, phone2,
            product_id, designation, qty, item_price, delivery_fee, total,
            duplicate_status, duplicate_of, review_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
            args: [
              name,
              address,
              city,
              governorate,
              phone,
              phone2,
              first.productId,
              designation,
              items.reduce((sum, item) => sum + item.qty, 0),
              subtotal,
              DELIVERY_FEE,
              total,
              duplicateStatus,
              duplicateOf,
              reviewReason,
            ],
          })
        : await tx.execute({
            sql: `
          INSERT INTO orders (
            name, address, city, governorate, phone, phone2,
            product_id, designation, qty, item_price, delivery_fee, total,
            duplicate_status, duplicate_of
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
            args: [
              name,
              address,
              city,
              governorate,
              phone,
              phone2,
              first.productId,
              designation,
              items.reduce((sum, item) => sum + item.qty, 0),
              subtotal,
              DELIVERY_FEE,
              total,
              duplicateStatus,
              duplicateOf,
            ],
          });

      const orderId = Number(result.lastInsertRowid);

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

      await tx.commit();

      return NextResponse.json({
        ok: true,
        id: orderId,
        subtotal,
        deliveryFee: DELIVERY_FEE,
        total,
      });
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  } catch (error) {
    if (isDuplicateReviewSchemaMissing(error)) {
      return NextResponse.json(
        {
          error: "duplicate_review_migration_required",
          message: "La base nécessite la migration de revue des doublons.",
        },
        { status: 503 }
      );
    }

    console.error("Order creation failed:", error);

    return NextResponse.json({ error: "order_failed" }, { status: 500 });
  }
}
