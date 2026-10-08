import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

type ProductInput = {
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

  if (!name || !category || !descFr || !descAr || !Number.isInteger(price) || price < 0
      || !images.length || !colors.length || !sizes.length) {
    return null;
  }
  return { name, category, price, descFr, descAr, images, colors, sizes, active: body.active === true };
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null) as ProductInput | null;
  const product = body && parseProduct(body);
  if (!product) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const result = db.prepare(`UPDATE products SET
    name=@name, category=@category, price=@price, desc_fr=@descFr, desc_ar=@descAr,
    images=@images, colors=@colors, sizes=@sizes, active=@active WHERE id=@id`).run({
    ...product,
    id: params.id,
    images: JSON.stringify(product.images),
    colors: JSON.stringify(product.colors),
    sizes: JSON.stringify(product.sizes),
    active: product.active ? 1 : 0,
  });
  if (!result.changes) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
