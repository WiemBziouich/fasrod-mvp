import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getProducts } from "@/lib/products";

type ProductInput = {
  id?: unknown;
  name?: unknown;
  category?: unknown;
  price?: unknown;
  descFr?: unknown;
  descAr?: unknown;
  images?: unknown;
  colors?: unknown;
  sizes?: unknown;
  active?: unknown;
};

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

function parseProduct(body: ProductInput) {
  const id = text(body.id, 80).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
  const name = text(body.name, 120);
  const category = text(body.category, 80);
  const descFr = text(body.descFr, 500);
  const descAr = text(body.descAr, 500);
  const price = Number(body.price);
  const images = Array.isArray(body.images) ? body.images.map((v) => text(v, 500)).filter(Boolean) : [];
  const colors = Array.isArray(body.colors)
    ? body.colors.map((c) => ({ name: text(c?.name, 80), hex: text(c?.hex, 20) })).filter((c) => c.name && /^#[0-9a-f]{6}$/i.test(c.hex))
    : [];
  const sizes = Array.isArray(body.sizes) ? body.sizes.map((v) => text(v, 20)).filter(Boolean) : [];

  if (!id || !name || !category || !descFr || !descAr || !Number.isInteger(price) || price < 0
      || !images.length || !colors.length || !sizes.length) {
    return null;
  }
  return { id, name, category, price, descFr, descAr, images, colors, sizes, active: body.active !== false };
}

export async function GET() {
  return NextResponse.json(getProducts());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as ProductInput | null;
  const product = body && parseProduct(body);
  if (!product) return NextResponse.json({ error: "invalid" }, { status: 400 });

  try {
    db.prepare(`INSERT INTO products
      (id, name, category, price, desc_fr, desc_ar, images, colors, sizes, active)
      VALUES (@id, @name, @category, @price, @descFr, @descAr, @images, @colors, @sizes, @active)`).run({
      ...product,
      images: JSON.stringify(product.images),
      colors: JSON.stringify(product.colors),
      sizes: JSON.stringify(product.sizes),
      active: product.active ? 1 : 0,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "exists" }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}
