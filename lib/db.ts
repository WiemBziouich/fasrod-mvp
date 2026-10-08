import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { DEFAULT_PRODUCTS } from "./data";

const dir = path.join(process.cwd(), "data");
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, "orders.db"));
db.pragma("journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, governorate TEXT NOT NULL,
  phone TEXT NOT NULL, phone2 TEXT NOT NULL,
  product_id TEXT NOT NULL, designation TEXT NOT NULL, qty INTEGER NOT NULL,
  item_price INTEGER NOT NULL, delivery_fee INTEGER NOT NULL, total INTEGER NOT NULL,
  exported_at TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL,
  desc_fr TEXT NOT NULL,
  desc_ar TEXT NOT NULL,
  images TEXT NOT NULL,
  colors TEXT NOT NULL,
  sizes TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
)`);

const productColumns = db.prepare("PRAGMA table_info(products)").all() as { name: string }[];
if (!productColumns.some((column) => column.name === "active")) {
  db.exec("ALTER TABLE products ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
}

const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get() as { count: number };
if (productCount.count === 0) {
  const insert = db.prepare(`INSERT INTO products
    (id, name, category, price, desc_fr, desc_ar, images, colors, sizes, active)
    VALUES (@id, @name, @category, @price, @desc_fr, @desc_ar, @images, @colors, @sizes, @active)`);
  db.transaction(() => {
    for (const product of DEFAULT_PRODUCTS) {
      insert.run({
        id: product.id,
        name: product.name,
        category: product.category,
        price: product.price,
        desc_fr: product.desc.fr,
        desc_ar: product.desc.ar,
        images: JSON.stringify(product.images),
        colors: JSON.stringify(product.colors),
        sizes: JSON.stringify(product.sizes),
        active: product.active ? 1 : 0,
      });
    }
  })();
}
export default db;
