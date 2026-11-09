import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";

const LOCAL_DATABASE_URL = "file:data/orders.db";
const databasePath = resolve(process.cwd(), "data", "orders.db");

if (
  process.env.TURSO_DATABASE_URL &&
  process.env.TURSO_DATABASE_URL !== LOCAL_DATABASE_URL
) {
  throw new Error(
    `Refusing migration: only ${LOCAL_DATABASE_URL} is allowed.`
  );
}

if (
  !existsSync(databasePath) ||
  realpathSync(databasePath).toLowerCase() !== databasePath.toLowerCase()
) {
  throw new Error(
    `Refusing migration: expected an existing local database at ${databasePath}.`
  );
}

const db = createClient({ url: LOCAL_DATABASE_URL });

try {
  const orderColumns = await db.execute("PRAGMA table_info(orders)");
  if (!orderColumns.rows.some((row) => String(row.name) === "id")) {
    throw new Error("Refusing migration: the local orders table is not recognized.");
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS order_edit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL
        REFERENCES orders(id) ON DELETE RESTRICT,
      edited_at TEXT NOT NULL DEFAULT (datetime('now')),
      before_json TEXT NOT NULL,
      after_json TEXT NOT NULL
    )
  `);

  const columns = await db.execute("PRAGMA table_info(order_edit_log)");
  const names = new Set(columns.rows.map((row) => String(row.name)));
  if (
    ["id", "order_id", "edited_at", "before_json", "after_json"].some(
      (name) => !names.has(name)
    )
  ) {
    throw new Error("Migration verification failed for order_edit_log.");
  }

  console.log("Local order-edit log schema is ready.");
} finally {
  await db.close();
}
