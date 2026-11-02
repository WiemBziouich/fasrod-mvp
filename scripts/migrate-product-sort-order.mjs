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
  const productColumns = await db.execute("PRAGMA table_info(products)");
  const existingColumns = new Set(
    productColumns.rows.map((row) => String(row.name))
  );
  if (!existingColumns.has("id")) {
    throw new Error("Refusing migration: the local products table is not recognized.");
  }

  if (!existingColumns.has("sort_order")) {
    try {
      await db.execute(
        "ALTER TABLE products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column name/i.test(message)) throw error;
    }
  }

  const migratedColumns = await db.execute("PRAGMA table_info(products)");
  if (!migratedColumns.rows.some((row) => String(row.name) === "sort_order")) {
    throw new Error("Migration verification failed for products.sort_order.");
  }

  await db.execute(`
    UPDATE products
    SET sort_order = (
      SELECT display_position * 10
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY rowid) AS display_position
        FROM products
      ) AS ordered_products
      WHERE ordered_products.id = products.id
    )
    WHERE sort_order = 0
  `);

  console.log("Local product sort-order schema is ready.");
} finally {
  await db.close();
}
