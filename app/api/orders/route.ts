import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { WILAYAS, DELIVERY_FEE, MAX_QTY } from "@/lib/data";
import { getProduct } from "@/lib/products";
import { isValidDelegation } from "@/lib/tunisia-locations";
import {
  basketsMatch,
  normalizeTunisiaPhone,
} from "@/lib/duplicate-orders.mjs";
import { isDuplicateReviewSchemaMissing } from "@/lib/duplicate-review-errors.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hits = new Map<string, number[]>();
const phoneHits = new Map<string, number[]>();

const clean = (value: unknown, max: number) =>
  String(value ?? "")
    .replace(/[;\r\n\t]+/g, " ")
    .trim()
    .slice(0, max);

type RequestedItem = {
  productId?: unknown;
  color?: unknown;
  size?: unknown;
  qty?: unknown;
};

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  // Seuil IP large (120 req/10 min) pour supporter les réseaux 4G tunisiens partagés (CGNAT)
  const recentIp = (hits.get(ip) || []).filter((time) => now - time < 600_000);

  if (recentIp.length >= 120) {
    return NextResponse.json({ error: "rate" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (body.website) {
    return NextResponse.json({ ok: true, id: 0 });
  }

  const requested = body.items as unknown;

  if (!Array.isArray(requested) || requested.length < 1 || requested.length > 20) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  const phone = normalizeTunisiaPhone(body.phone);
  const phone2 = body.phone2 ? normalizeTunisiaPhone(body.phone2) : phone;

  if (!phone || !phone2) {
    return NextResponse.json({ error: "phone" }, { status: 400 });
  }

  // Protection anti-doublon / spam par numéro : max 4 commandes par numéro en 10 minutes
  const recentPhone = (phoneHits.get(phone) || []).filter((time) => now - time < 600_000);
  if (recentPhone.length >= 4) {
    return NextResponse.json({ error: "rate" }, { status: 429 });
  }

  const name = clean(body.name, 80);
  const address = clean(body.address, 200);
  const city = clean(body.city, 60);
  const governorate = WILAYAS.find((w) => w.v === body.governorate)?.v;

  if (
    name.length < 3 ||
    address.length < 5 ||
    city.length < 2 ||
    !governorate ||
    !isValidDelegation(governorate, city)
  ) {
    return NextResponse.json({ error: "fields" }, { status: 400 });
  }

  const items: {
    productId: string;
    productName: string;
    color: string;
    size: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }[] = [];

  const seen = new Set<string>();

  for (const raw of requested as RequestedItem[]) {
    const productId = typeof raw.productId === "string" ? raw.productId : "";
    const color = typeof raw.color === "string" ? raw.color : "";
    const size = typeof raw.size === "string" ? raw.size : "";
    const qty = Number(raw.qty);

    if (!productId || !color || !size || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }

    const uniqueKey = `${productId}::${color}::${size}`;
    if (seen.has(uniqueKey)) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    seen.add(uniqueKey);

    const product = await getProduct(productId, true);

    if (!product) {
      return NextResponse.json({ error: "unavailable" }, { status: 400 });
    }

    if (
      !product.sizes.includes(size) ||
      !product.colors.some((entry) => entry.name === color)
    ) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }

    items.push({
      productId: product.id,
      productName: product.name,
      color,
      size,
      qty,
      unitPrice: product.price,
      lineTotal: product.price * qty,
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal + DELIVERY_FEE;
  const designation = items
    .map((item) => `${item.productName} - ${item.color} - ${item.size} x${item.qty}`)
    .join(" + ");

  try {
    const tx = await db.transaction("write");
    try {
      const recentOrders = await tx.execute(`
        SELECT id, phone, phone2
        FROM orders
        WHERE datetime(created_at) >= datetime('now', '-30 days')
          AND duplicate_status IN ('normal', 'pending_review', 'confirmed_new')
      `);
      const submittedPhones = new Set([phone, phone2]);
      const candidateIds = recentOrders.rows
        .filter((row) => {
          const candidatePhones = [
            normalizeTunisiaPhone(row.phone),
            normalizeTunisiaPhone(row.phone2),
          ].filter((candidate): candidate is string => candidate !== null);
          return candidatePhones.some((candidate) => submittedPhones.has(candidate));
        })
        .map((row) => Number(row.id));

      const candidateBaskets = new Map<number, {
        product_id: string;
        color: string;
        size: string;
        qty: number;
      }[]>();
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
      const duplicateOf =
        candidateIds
          .sort((left, right) => right - left)
          .find((candidateId) =>
            basketsMatch(submittedBasket, candidateBaskets.get(candidateId) ?? [])
          ) ?? null;
      const duplicateStatus = duplicateOf === null ? "normal" : "pending_review";

      const first = items[0];
      const result = await tx.execute({
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

      hits.set(ip, [...recentIp, now]);
      phoneHits.set(phone, [...recentPhone, now]);

      return NextResponse.json({ ok: true, id: orderId, subtotal, deliveryFee: DELIVERY_FEE, total });
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
