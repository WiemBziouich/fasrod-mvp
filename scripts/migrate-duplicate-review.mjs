import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";

const LOCAL_DATABASE_URL = "file:data/orders.db";
const expectedPath = resolve(process.cwd(), "data", "orders.db");

if (process.env.TURSO_DATABASE_URL !== LOCAL_DATABASE_URL) {
  throw new Error(
    `Refusing migration: set TURSO_DATABASE_URL explicitly to ${LOCAL_DATABASE_URL}.`
  );
}

if (!existsSync(expectedPath) || realpathSync(expectedPath) !== expectedPath) {
  throw new Error(
    `Refusing migration: expected an existing local database at ${expectedPath}.`
  );
}

const db = createClient({ url: LOCAL_DATABASE_URL });

try {
  const columns = await db.execute("PRAGMA table_info(orders)");
  if (!columns.rows.length) {
    throw new Error("Refusing migration: the local orders table does not exist.");
  }

  const columnNames = new Set(
    columns.rows.map((row) => String(row.name))
  );
  const itemColumns = await db.execute("PRAGMA table_info(order_items)");
  const itemColumnNames = new Set(
    itemColumns.rows.map((row) => String(row.name))
  );
  const requiredOrderColumns = ["id", "created_at", "phone", "phone2"];
  const requiredItemColumns = [
    "order_id",
    "product_id",
    "color",
    "size",
    "qty",
  ];
  if (
    requiredOrderColumns.some((name) => !columnNames.has(name)) ||
    requiredItemColumns.some((name) => !itemColumnNames.has(name))
  ) {
    throw new Error(
      "Refusing migration: the local orders/order_items schema is not recognized."
    );
  }

  if (!columnNames.has("duplicate_status")) {
    await db.execute(`
      ALTER TABLE orders
      ADD COLUMN duplicate_status TEXT NOT NULL DEFAULT 'normal'
      CHECK (duplicate_status IN (
        'normal', 'pending_review', 'confirmed_new', 'confirmed_duplicate'
      ))
    `);
  }

  if (!columnNames.has("duplicate_of")) {
    await db.execute(
      "ALTER TABLE orders ADD COLUMN duplicate_of INTEGER"
    );
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS order_review_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL
        REFERENCES orders(id) ON DELETE RESTRICT,
      previous_status TEXT NOT NULL,
      new_status TEXT NOT NULL CHECK (new_status IN (
        'normal', 'pending_review', 'confirmed_new', 'confirmed_duplicate'
      )),
      previous_duplicate_of INTEGER
        REFERENCES orders(id) ON DELETE RESTRICT,
      duplicate_of INTEGER
        REFERENCES orders(id) ON DELETE RESTRICT,
      reviewed_by TEXT NOT NULL DEFAULT 'unknown',
      reviewed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const historyColumns = await db.execute(
    "PRAGMA table_info(order_review_history)"
  );
  const historyColumnNames = new Set(
    historyColumns.rows.map((row) => String(row.name))
  );
  if (!historyColumnNames.has("reviewed_by")) {
    await db.execute(`
      ALTER TABLE order_review_history
      ADD COLUMN reviewed_by TEXT NOT NULL DEFAULT 'unknown'
    `);
  } else {
    const reviewerColumn = historyColumns.rows.find(
      (row) => String(row.name) === "reviewed_by"
    );
    if (
      String(reviewerColumn.type ?? "").toUpperCase() !== "TEXT" ||
      Number(reviewerColumn.notnull) !== 1 ||
      String(reviewerColumn.dflt_value ?? "").toLowerCase() !== "'unknown'"
    ) {
      throw new Error(
        "Refusing migration: the existing reviewed_by column is incompatible."
      );
    }
  }
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_orders_duplicate_status_created_at
    ON orders(duplicate_status, created_at)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_orders_duplicate_of
    ON orders(duplicate_of)
  `);

  console.log(`Duplicate-review schema is ready in ${expectedPath}.`);
} finally {
  await db.close();
}
