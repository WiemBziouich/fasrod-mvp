import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { WILAYAS, DELIVERY_FEE, MAX_QTY } from "@/lib/data";
import { getProduct } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hits = new Map<string, number[]>();

const clean = (value: unknown, max: number) =>
  String(value ?? "")
    .replace(/[;\r\n\t]+/g, " ")
    .trim()
    .slice(0, max);

const phoneOf = (value: unknown) => {
  const digits = String(value ?? "")
    .replace(/[\s.-]/g, "")
    .replace(/^(\+216|00216)/, "");
  return /^\d{8}$/.test(digits) ? digits : null;
};

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
  const recent = (hits.get(ip) || []).filter((time) => now - time < 600_000);

  if (recent.length >= 5) {
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

  const phone = phoneOf(body.phone);
  const phone2 = body.phone2 ? phoneOf(body.phone2) : phone;

  if (!phone || !phone2) {
    return NextResponse.json({ error: "phone" }, { status: 400 });
  }

  const name = clean(body.name, 80);
  const address = clean(body.address, 200);
  const city = clean(body.city, 60);
  const governorate = WILAYAS.find((w) => w.v === body.governorate)?.v;

  if (name.length < 3 || address.length < 5 || city.length < 2 || !governorate) {
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

    const product = getProduct(productId, true);

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
    const createOrder = db.transaction(() => {
      // Colonnes historiques conservées pour compatibilité.
      const first = items[0];

      const result = db.prepare(`
        INSERT INTO orders (
          name, address, city, governorate, phone, phone2,
          product_id, designation, qty, item_price, delivery_fee, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
        total
      );

      const orderId = Number(result.lastInsertRowid);

      const insertItem = db.prepare(`
        INSERT INTO order_items (
          order_id, product_id, product_name, color, size,
          qty, unit_price, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        insertItem.run(
          orderId,
          item.productId,
          item.productName,
          item.color,
          item.size,
          item.qty,
          item.unitPrice,
          item.lineTotal
        );
      }

      return orderId;
    });

    const id = createOrder();
    hits.set(ip, [...recent, now]);

    return NextResponse.json({ ok: true, id, subtotal, deliveryFee: DELIVERY_FEE, total });
  } catch (error) {
    console.error("Order creation failed:", error);
    return NextResponse.json({ error: "order_failed" }, { status: 500 });
  }
}
