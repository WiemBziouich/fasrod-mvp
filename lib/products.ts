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
  price: row.price,
  desc: { fr: row.desc_fr, ar: row.desc_ar },
  images: JSON.parse(row.images),
  colors: JSON.parse(row.colors),
  sizes: JSON.parse(row.sizes),
  active: Boolean(row.active),
});

export const getProducts = (activeOnly = false) => {
  const rows = db.prepare(
    `SELECT * FROM products ${activeOnly ? "WHERE active = 1" : ""} ORDER BY rowid`
  ).all() as ProductRow[];
  return rows.map(mapProduct);
};

export const getProduct = (id: string, activeOnly = true) => {
  const row = db.prepare(
    `SELECT * FROM products WHERE id = ? ${activeOnly ? "AND active = 1" : ""}`
  ).get(id) as ProductRow | undefined;
  return row ? mapProduct(row) : undefined;
};
