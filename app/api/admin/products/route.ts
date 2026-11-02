
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getProducts, isProductSortOrderMissing } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function parseProduct(body: ProductInput) {
  const id = text(body.id, 80);
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
    !/^[a-z0-9-]{2,80}$/.test(id) ||
    id === "reorder" ||
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
    sizes.length === 0
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
    id,
    name,
    category,
    price,
    descFr,
    descAr,
    images,
    colors,
    sizes,
    active: body.active !== false,
  };
}

export async function GET() {
  try {
    return NextResponse.json(await getProducts());
  } catch (error) {
    console.error("GET products failed:", error);
    return NextResponse.json(
      { error: "database_error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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

  let tx: Awaited<ReturnType<typeof db.transaction>> | null = null;
  try {
    tx = await db.transaction("write");
    const minimumResult = await tx.execute(
      "SELECT MIN(sort_order) AS minimum FROM products"
    );
    const minimum = minimumResult.rows[0]?.minimum;
    const sortOrder = minimum == null ? 0 : Number(minimum) - 10;

    await tx.execute({
      sql: `
        INSERT INTO products (
          id, name, category, price, desc_fr, desc_ar,
          images, colors, sizes, active, sort_order
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        product.id,
        product.name,
        product.category,
        product.price,
        product.descFr,
        product.descAr,
        JSON.stringify(product.images),
        JSON.stringify(product.colors),
        JSON.stringify(product.sizes),
        product.active ? 1 : 0,
        sortOrder,
      ],
    });
    await tx.commit();

    return NextResponse.json(
      { ok: true, id: product.id },
      { status: 201 }
    );
  } catch (error) {
    if (tx) await tx.rollback();
    const message =
      error instanceof Error ? error.message : "";

    if (isProductSortOrderMissing(error)) {
      return NextResponse.json(
        {
          error: "product_sort_order_migration_required",
          message: "La migration de l'ordre des produits est requise.",
        },
        { status: 503 }
      );
    }

    if (message.includes("UNIQUE constraint failed")) {
      return NextResponse.json(
        { error: "exists" },
        { status: 409 }
      );
    }

    console.error("POST product failed:", error);

    return NextResponse.json(
      { error: "database_error" },
      { status: 500 }
    );
  }
}
