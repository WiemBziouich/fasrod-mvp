import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

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
export default db;
