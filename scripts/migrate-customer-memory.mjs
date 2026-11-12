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
  const orders = await db.execute("PRAGMA table_info(orders)");
  const orderColumns = new Set(orders.rows.map((row) => String(row.name)));
  if (!orderColumns.has("id") || !orderColumns.has("phone")) {
    throw new Error("Refusing migration: local orders schema is not recognized.");
  }
  if (!orderColumns.has("review_reason")) {
    await db.execute(
      "ALTER TABLE orders ADD COLUMN review_reason TEXT NOT NULL DEFAULT ''"
    );
  }
  await db.execute(`CREATE TABLE IF NOT EXISTS flagged_phones (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL UNIQUE, reason TEXT NOT NULL CHECK (reason IN ('retour','refus','injoignable','autre')), note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 200), created_at TEXT NOT NULL DEFAULT (datetime('now')), active INTEGER NOT NULL DEFAULT 1)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS navex_parcels (code TEXT PRIMARY KEY, phone TEXT NOT NULL, phone2 TEXT NOT NULL DEFAULT '', state TEXT NOT NULL CHECK (state IN ('pending','depot','in_transit','delivered','returned','to_verify','exchange','unserious','other')), state_raw TEXT NOT NULL DEFAULT '', motif TEXT NOT NULL DEFAULT '', price INTEGER, parcel_date TEXT, order_id INTEGER, first_seen_at TEXT NOT NULL DEFAULT (datetime('now')), state_changed_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const parcelColumns = await db.execute("PRAGMA table_info(navex_parcels)");
  const parcelColumnNames = new Set(
    parcelColumns.rows.map((row) => String(row.name))
  );
  const parcelSchema = await db.execute(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'navex_parcels'"
  );
  const supportsUnserious = /['"]unserious['"]/.test(
    String(parcelSchema.rows[0]?.sql ?? "")
  );
  if (
    !parcelColumnNames.has("first_seen_at") ||
    !parcelColumnNames.has("state_changed_at") ||
    !supportsUnserious
  ) {
    const firstSeenValue = parcelColumnNames.has("first_seen_at")
      ? "first_seen_at"
      : "COALESCE(parcel_date, datetime('now'))";
    const stateChangedValue = parcelColumnNames.has("state_changed_at")
      ? "state_changed_at"
      : "datetime('now')";
    const tx = await db.transaction("write");
    try {
      await tx.execute(`CREATE TABLE navex_parcels_new (code TEXT PRIMARY KEY, phone TEXT NOT NULL, phone2 TEXT NOT NULL DEFAULT '', state TEXT NOT NULL CHECK (state IN ('pending','depot','in_transit','delivered','returned','to_verify','exchange','unserious','other')), state_raw TEXT NOT NULL DEFAULT '', motif TEXT NOT NULL DEFAULT '', price INTEGER, parcel_date TEXT, order_id INTEGER, first_seen_at TEXT NOT NULL DEFAULT (datetime('now')), state_changed_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      await tx.execute(`
        INSERT INTO navex_parcels_new (
          code, phone, phone2, state, state_raw, motif, price, parcel_date,
          order_id, first_seen_at, state_changed_at, updated_at
        )
        SELECT code, phone, phone2, state, state_raw, motif, price, parcel_date,
          order_id, ${firstSeenValue}, ${stateChangedValue}, updated_at
        FROM navex_parcels
      `);
      await tx.execute("DROP TABLE navex_parcels");
      await tx.execute("ALTER TABLE navex_parcels_new RENAME TO navex_parcels");
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
  await db.execute("CREATE INDEX IF NOT EXISTS idx_navex_parcels_phone ON navex_parcels(phone)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_navex_parcels_phone2 ON navex_parcels(phone2)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_navex_parcels_state ON navex_parcels(state)");
  await db.execute("CREATE TABLE IF NOT EXISTS navex_sync_state (id INTEGER PRIMARY KEY CHECK (id = 1), last_sync_at TEXT, last_status TEXT, last_count INTEGER, last_error TEXT CHECK (last_error IS NULL OR length(last_error) <= 255))");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_flagged_phones_active_phone ON flagged_phones(active, phone)");

  const migrated = await db.execute("PRAGMA table_info(orders)");
  if (!migrated.rows.some((row) => String(row.name) === "review_reason")) {
    throw new Error("Customer-memory migration verification failed.");
  }
  console.log("Local customer-memory schema is ready.");
} finally {
  await db.close();
}
