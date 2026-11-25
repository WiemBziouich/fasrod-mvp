const MIGRATIONS = [
  {
    version: 1,
    name: "central-order-foundation",
    async up(tx) {
      const orderColumns = await tx.execute("PRAGMA table_info(orders)");
      const existingOrderColumns = new Set(
        orderColumns.rows.map((row) => String(row.name))
      );
      if (!existingOrderColumns.has("id")) {
        throw new Error(
          "Central-order foundation requires the existing orders table."
        );
      }
      if (
        existingOrderColumns.has("customer_id") ||
        existingOrderColumns.has("source")
      ) {
        throw new Error(
          "Order foundation columns exist without a matching migration-ledger entry."
        );
      }

      const existingTables = await tx.execute(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN ('customers', 'customer_phones', 'order_activity')
      `);
      if (existingTables.rows.length) {
        throw new Error(
          "Central-order foundation tables exist without a matching migration-ledger entry."
        );
      }

      await tx.execute(`
        CREATE TABLE customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await tx.execute(`
        CREATE TABLE customer_phones (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL
            REFERENCES customers(id) ON DELETE RESTRICT,
          phone TEXT NOT NULL CHECK (length(trim(phone)) > 0),
          normalized_phone TEXT NOT NULL
            CHECK (length(trim(normalized_phone)) > 0),
          label TEXT NOT NULL DEFAULT 'other'
            CHECK (label IN ('primary', 'secondary', 'other')),
          is_verified INTEGER NOT NULL DEFAULT 0
            CHECK (is_verified IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (customer_id, normalized_phone)
        )
      `);
      await tx.execute(`
        CREATE INDEX idx_customer_phones_normalized_phone
        ON customer_phones(normalized_phone)
      `);

      await tx.execute(`
        CREATE TABLE order_activity (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL
            REFERENCES orders(id) ON DELETE RESTRICT,
          event_type TEXT NOT NULL CHECK (length(trim(event_type)) > 0),
          actor_type TEXT NOT NULL
            CHECK (actor_type IN ('system', 'staff', 'legacy')),
          staff_identifier TEXT
            CHECK (
              staff_identifier IS NULL
              OR length(trim(staff_identifier)) > 0
            ),
          details_json TEXT NOT NULL DEFAULT '{}'
            CHECK (json_valid(details_json)),
          occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
          legacy_source TEXT,
          legacy_id TEXT,
          CHECK (
            (legacy_source IS NULL AND legacy_id IS NULL)
            OR (legacy_source IS NOT NULL AND legacy_id IS NOT NULL)
          ),
          UNIQUE (legacy_source, legacy_id)
        )
      `);
      await tx.execute(`
        CREATE INDEX idx_order_activity_order_occurred_at
        ON order_activity(order_id, occurred_at)
      `);
      await tx.execute(`
        ALTER TABLE orders
        ADD COLUMN customer_id INTEGER
          REFERENCES customers(id) ON DELETE RESTRICT
      `);
      await tx.execute(`
        ALTER TABLE orders
        ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy_unknown'
          CHECK (source IN ('website', 'instagram', 'admin', 'legacy_unknown'))
      `);
      await tx.execute(`
        CREATE INDEX idx_orders_customer_id ON orders(customer_id)
      `);
    },
  },
];

const REQUIRED_LEDGER_COLUMNS = ["version", "name", "applied_at"];

async function enableForeignKeys(db) {
  await db.execute("PRAGMA foreign_keys = ON");
  const result = await db.execute("PRAGMA foreign_keys");
  if (Number(result.rows[0]?.foreign_keys ?? 0) !== 1) {
    throw new Error("SQLite foreign-key enforcement could not be enabled.");
  }
}

async function assertLedgerSchema(db) {
  const result = await db.execute("PRAGMA table_info(schema_migrations)");
  const names = new Set(result.rows.map((row) => String(row.name)));
  if (REQUIRED_LEDGER_COLUMNS.some((column) => !names.has(column))) {
    throw new Error("Existing schema_migrations table has an incompatible schema.");
  }
}

async function assertFoundationSchema(db) {
  const tables = await db.execute(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name IN ('customers', 'customer_phones', 'order_activity')
  `);
  const tableNames = new Set(tables.rows.map((row) => String(row.name)));
  if (
    ["customers", "customer_phones", "order_activity"].some(
      (table) => !tableNames.has(table)
    )
  ) {
    throw new Error("Central-order foundation tables are missing.");
  }

  const orderColumns = await db.execute("PRAGMA table_info(orders)");
  const orderColumnNames = new Set(
    orderColumns.rows.map((row) => String(row.name))
  );
  if (
    !orderColumnNames.has("customer_id") ||
    !orderColumnNames.has("source")
  ) {
    throw new Error("Central-order foundation order columns are missing.");
  }
}

export async function applyCentralOrderMigrations(db) {
  await enableForeignKeys(db);

  const ledgerExists = await db.execute(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = 'schema_migrations'
  `);
  if (!ledgerExists.rows.length) {
    const ordersExists = await db.execute(`
      SELECT 1 AS present
      FROM sqlite_master
      WHERE type = 'table' AND name = 'orders'
    `);
    if (!ordersExists.rows.length) {
      throw new Error(
        "Cannot initialize central-order migrations without the existing core orders schema."
      );
    }
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await assertLedgerSchema(db);

  const ledger = await db.execute(
    "SELECT version, name FROM schema_migrations ORDER BY version"
  );
  const appliedMigrations = new Map(
    ledger.rows.map((row) => [Number(row.version), String(row.name)])
  );
  for (const [version, name] of appliedMigrations) {
    const migration = MIGRATIONS.find((item) => item.version === version);
    if (!migration || migration.name !== name) {
      throw new Error(
        `Unknown or incompatible schema migration ledger entry: ${version}.`
      );
    }
  }

  const appliedNow = [];
  for (const migration of MIGRATIONS) {
    if (appliedMigrations.has(migration.version)) continue;

    const tx = await db.transaction("write");
    try {
      const transactionForeignKeys = await tx.execute("PRAGMA foreign_keys");
      if (Number(transactionForeignKeys.rows[0]?.foreign_keys ?? 0) !== 1) {
        throw new Error(
          "SQLite foreign-key enforcement is not enabled for the migration transaction."
        );
      }
      await migration.up(tx);
      await tx.execute({
        sql: `
          INSERT INTO schema_migrations (version, name)
          VALUES (?, ?)
        `,
        args: [migration.version, migration.name],
      });
      await tx.commit();
      appliedNow.push(migration.version);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  await assertFoundationSchema(db);
  return appliedNow;
}

export { MIGRATIONS };
