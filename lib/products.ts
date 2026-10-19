import db from "./db";
import { Product } from "./data";

type ProductRow = {
  id: string;
  name: string;
  category: string;
  price: number;
  desc_fr: string;
  desc_ar: string;
  images: string;
  colors: string;
  sizes: string;
  active: number;
};

const mapProduct = (row: ProductRow): Product => ({
  id: row.id,
  name: row.name,
  category: row.category,
  price: Number(row.price),
  desc: { fr: row.desc_fr, ar: row.desc_ar },
  images: typeof row.images === "string" ? JSON.parse(row.images) : (row.images || []),
  colors: typeof row.colors === "string" ? JSON.parse(row.colors) : (row.colors || []),
  sizes: typeof row.sizes === "string" ? JSON.parse(row.sizes) : (row.sizes || []),
  active: Boolean(row.active),
});

export const getProducts = async (activeOnly = false): Promise<Product[]> => {
  const result = await db.execute(
    `SELECT * FROM products ${activeOnly ? "WHERE active = 1" : ""} ORDER BY rowid`
  );
  return (result.rows as unknown as ProductRow[]).map(mapProduct);
};

export const getProduct = async (
  id: string,
  activeOnly = true
): Promise<Product | undefined> => {
  const result = await db.execute({
    sql: `SELECT * FROM products WHERE id = ? ${activeOnly ? "AND active = 1" : ""}`,
    args: [id],
  });
  const row = result.rows[0] as unknown as ProductRow | undefined;
  return row ? mapProduct(row) : undefined;
};
