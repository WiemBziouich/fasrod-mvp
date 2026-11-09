import { WILAYAS, MAX_QTY } from "@/lib/data";
import { getProduct } from "@/lib/products";
import { isValidDelegation } from "@/lib/tunisia-locations";
import { normalizeTunisiaPhone } from "@/lib/duplicate-orders.mjs";

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

export type ValidatedOrderItem = {
  productId: string;
  productName: string;
  color: string;
  size: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type ValidatedOrderInput = {
  name: string;
  address: string;
  city: string;
  governorate: string;
  phone: string;
  phone2: string;
  items: ValidatedOrderItem[];
};

export type OrderInputError = "empty" | "phone" | "fields" | "invalid" | "unavailable";

export async function validateOrderInput(
  body: Record<string, unknown>
): Promise<
  | { ok: true; value: ValidatedOrderInput }
  | { ok: false; error: OrderInputError }
> {
  const requested = body.items;
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > 20) {
    return { ok: false, error: "empty" };
  }

  const phone = normalizeTunisiaPhone(body.phone);
  const phone2 = body.phone2 ? normalizeTunisiaPhone(body.phone2) : phone;
  if (!phone || !phone2) return { ok: false, error: "phone" };

  const name = clean(body.name, 80);
  const address = clean(body.address, 200);
  const city = clean(body.city, 60);
  const governorate = WILAYAS.find((wilaya) => wilaya.v === body.governorate)?.v;
  if (
    name.length < 3 ||
    address.length < 5 ||
    city.length < 2 ||
    !governorate ||
    !isValidDelegation(governorate, city)
  ) {
    return { ok: false, error: "fields" };
  }

  const items: ValidatedOrderItem[] = [];
  const seen = new Set<string>();

  for (const raw of requested as RequestedItem[]) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "invalid" };
    }
    const productId = typeof raw.productId === "string" ? raw.productId : "";
    const color = typeof raw.color === "string" ? raw.color : "";
    const size = typeof raw.size === "string" ? raw.size : "";
    const qty = Number(raw.qty);

    if (
      !productId ||
      !color ||
      !size ||
      !Number.isInteger(qty) ||
      qty < 1 ||
      qty > MAX_QTY
    ) {
      return { ok: false, error: "invalid" };
    }

    const uniqueKey = `${productId}::${color}::${size}`;
    if (seen.has(uniqueKey)) return { ok: false, error: "invalid" };
    seen.add(uniqueKey);

    const product = await getProduct(productId, true);
    if (!product) return { ok: false, error: "unavailable" };
    if (
      !product.sizes.includes(size) ||
      !product.colors.some((entry) => entry.name === color)
    ) {
      return { ok: false, error: "invalid" };
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

  return {
    ok: true,
    value: { name, address, city, governorate, phone, phone2, items },
  };
}
