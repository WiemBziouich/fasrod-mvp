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
  const existingColumns = new Set(
    orderColumns.rows.map((row) => String(row.name))
  );
  if (!existingColumns.has("id") || !existingColumns.has("exported_at")) {
    throw new Error("Refusing migration: the local orders table is not recognized.");
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS export_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      order_count INTEGER NOT NULL,
      confirmed_at TEXT
    )
  `);

  if (!existingColumns.has("export_batch_id")) {
    await db.execute("ALTER TABLE orders ADD COLUMN export_batch_id INTEGER");
  }
  if (!existingColumns.has("import_confirmed_at")) {
    await db.execute("ALTER TABLE orders ADD COLUMN import_confirmed_at TEXT");
  }
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_orders_export_batch
    ON orders(export_batch_id)
  `);

  const migratedColumns = await db.execute("PRAGMA table_info(orders)");
  const columnNames = new Set(
    migratedColumns.rows.map((row) => String(row.name))
  );
  if (
    !columnNames.has("export_batch_id") ||
    !columnNames.has("import_confirmed_at")
  ) {
    throw new Error("Migration verification failed for orders columns.");
  }
  const batchTable = await db.execute(
    "PRAGMA table_info(export_batches)"
  );
  const batchColumns = new Set(batchTable.rows.map((row) => String(row.name)));
  if (
    !batchColumns.has("id") ||
    !batchColumns.has("created_at") ||
    !batchColumns.has("order_count") ||
    !batchColumns.has("confirmed_at")
  ) {
    throw new Error("Migration verification failed for export_batches columns.");
  }

  console.log("Local export-batch schema is ready.");
} finally {
  await db.close();
}
