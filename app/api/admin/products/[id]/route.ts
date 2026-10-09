
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function parseProduct(body: ProductInput) {
  const name = text(body.name, 120);
  const category = text(body.category, 80);
  const descFr = text(body.descFr, 2000);
  const descAr = text(body.descAr, 2000);
  const price = Number(body.price);

  const images = Array.isArray(body.images)
    ? body.images
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().slice(0, 1000))
        .filter(Boolean)
    : [];

  const colors = Array.isArray(body.colors)
    ? body.colors
        .filter(
          (value) =>
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
        )
        .map((value) => {
          const color = value as {
            name?: unknown;
            hex?: unknown;
            images?: unknown;
          };

          const colorImages = Array.isArray(color.images)
            ? color.images
                .filter(
                  (image): image is string =>
                    typeof image === "string"
                )
                .map((image) => image.trim().slice(0, 1000))
                .filter(Boolean)
            : [];

          return {
            name: text(color.name, 80),
            hex: text(color.hex, 7),
            images: colorImages,
          };
        })
    : [];

  const sizes = Array.isArray(body.sizes)
    ? body.sizes
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().slice(0, 20))
        .filter(Boolean)
    : [];

  const validImage = (image: string) =>
    image.startsWith("/") || /^https?:\/\//i.test(image);

  if (
    !name ||
    !category ||
    !descFr ||
    !descAr ||
    !Number.isSafeInteger(price) ||
    price < 0 ||
    images.length === 0 ||
    images.length > 20 ||
    images.some((image) => !validImage(image)) ||
    colors.length === 0 ||
    colors.some(
      (color) =>
        !color.name ||
        !/^#[0-9a-fA-F]{6}$/.test(color.hex) ||
        color.images.length === 0 ||
        color.images.length > 20 ||
        color.images.some((image) => !validImage(image))
    ) ||
    sizes.length === 0 ||
    typeof body.active !== "boolean"
  ) {
    return null;
  }

  const uniqueColorNames = colors.map((color) =>
    color.name.toLowerCase()
  );

  if (new Set(uniqueColorNames).size !== uniqueColorNames.length) {
    return null;
  }

  return {
    name,
    category,
    price,
    descFr,
    descAr,
    images,
    colors,
    sizes,
    active: body.active,
  };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: ProductInput;

  try {
    body = (await req.json()) as ProductInput;
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 }
    );
  }

  const product = parseProduct(body);

  if (!product) {
    return NextResponse.json(
      { error: "invalid" },
      { status: 400 }
    );
  }

  try {
    const result = db.prepare(`
      UPDATE products SET
        name = @name,
        category = @category,
        price = @price,
        desc_fr = @descFr,
        desc_ar = @descAr,
        images = @images,
        colors = @colors,
        sizes = @sizes,
        active = @active
      WHERE id = @id
    `).run({
      ...product,
      id: params.id,
      images: JSON.stringify(product.images),
      colors: JSON.stringify(product.colors),
      sizes: JSON.stringify(product.sizes),
      active: product.active ? 1 : 0,
    });

    if (!result.changes) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PUT product failed:", error);

    return NextResponse.json(
      { error: "database_error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = db
      .prepare("DELETE FROM products WHERE id = ?")
      .run(params.id);

    if (!result.changes) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE product failed:", error);

    return NextResponse.json(
      { error: "database_error" },
      { status: 500 }
    );
  }
}
