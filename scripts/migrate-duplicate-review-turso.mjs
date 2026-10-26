import { createClient } from "@libsql/client";
import { isIP } from "node:net";

const STATUSES = [
  "normal",
  "pending_review",
  "confirmed_new",
  "confirmed_duplicate",
];
const STATUS_CHECK =
  `duplicate_statusin(${STATUSES.map((status) => `'${status}'`).join(",")})`;
const HISTORY_STATUS_CHECK =
  `new_statusin(${STATUSES.map((status) => `'${status}'`).join(",")})`;
const EXPECTED_COLUMNS = {
  orders: ["id", "created_at", "phone", "phone2"],
  order_items: ["order_id", "product_id", "color", "size", "qty"],
};

function normalizeSql(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s"`\[\]]/g, "");
}

function checkExpressions(createSql) {
  const sql = normalizeSql(createSql);
  const expressions = [];
  let searchFrom = 0;

  while (true) {
    const checkAt = sql.indexOf("check(", searchFrom);
    if (checkAt === -1) return expressions;

    const start = checkAt + "check".length;
    let depth = 0;
    let end = start;
    for (; end < sql.length; end += 1) {
      if (sql[end] === "(") depth += 1;
      if (sql[end] === ")") {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }
    if (depth !== 0) {
      throw new Error("Could not inspect an existing CHECK constraint.");
    }
    expressions.push(sql.slice(start + 1, end - 1));
    searchFrom = end;
  }
}

function assertColumn(columns, name, expected) {
  const column = columns.find((item) => String(item.name) === name);
  if (!column) throw new Error(`Required column is missing: ${name}.`);

  if (
    String(column.type ?? "").toUpperCase() !== expected.type ||
    Number(column.notnull) !== expected.notNull ||
    String(column.pk ?? "0") !== String(expected.primaryKey ?? 0)
  ) {
    throw new Error(`Existing column has an incompatible definition: ${name}.`);
  }

  const actualDefault = normalizeSql(column.dflt_value);
  if (actualDefault !== expected.defaultValue) {
    throw new Error(`Existing column has an incompatible default: ${name}.`);
  }
}

function assertExpectedHost(urlValue, expectedHost) {
  if (!urlValue || !expectedHost) {
    throw new Error(
      "Set TURSO_DATABASE_URL and TURSO_MIGRATION_EXPECTED_HOST explicitly."
    );
  }

  let parsed;
  try {
    parsed = new URL(urlValue);
  } catch {
    throw new Error("TURSO_DATABASE_URL is not a valid database URL.");
  }

  if (parsed.protocol === "file:") {
    throw new Error("Refusing a file URL; this script is only for remote Turso.");
  }
  if (!["libsql:", "https:"].includes(parsed.protocol)) {
    throw new Error("Refusing an unsupported remote database protocol.");
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.port ||
    !["", "/"].includes(parsed.pathname)
  ) {
    throw new Error("TURSO_DATABASE_URL contains unsupported URL components.");
  }

  const host = parsed.hostname.toLowerCase();
  const confirmation = expectedHost.trim().toLowerCase();
  if (
    !host ||
    !confirmation ||
    /[/:?#@\s]/.test(confirmation) ||
    host !== confirmation
  ) {
    throw new Error(
      "The URL host does not exactly match TURSO_MIGRATION_EXPECTED_HOST."
    );
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    isIP(host)
  ) {
    throw new Error("Refusing a local or IP-address database host.");
  }
}

async function rowsFor(db, sql) {
  const result = await db.execute(sql);
  return result.rows;
}

async function objectMap(db) {
  const rows = await rowsFor(
    db,
    `SELECT type, name, tbl_name, sql
     FROM sqlite_master
     WHERE name IN (
       'orders', 'order_items', 'order_review_history',
       'idx_orders_duplicate_status_created_at', 'idx_orders_duplicate_of'
     )`
  );
  return new Map(rows.map((row) => [String(row.name), row]));
}

async function tableColumns(db, table) {
  return rowsFor(db, `PRAGMA table_info("${table}")`);
}

async function foreignKeys(db, table) {
  return rowsFor(db, `PRAGMA foreign_key_list("${table}")`);
}

function assertTable(object, name) {
  if (!object || String(object.type) !== "table") {
    throw new Error(`Required table is missing or is not a table: ${name}.`);
  }
}

async function assertBaseSchema(db, objects) {
  for (const [table, required] of Object.entries(EXPECTED_COLUMNS)) {
    assertTable(objects.get(table), table);
    const columns = await tableColumns(db, table);
    const names = new Set(columns.map((column) => String(column.name)));
    if (required.some((name) => !names.has(name))) {
      throw new Error(`The existing ${table} schema is not recognized.`);
    }
  }
}

function assertStatusColumn(columns, createSql) {
  assertColumn(columns, "duplicate_status", {
    type: "TEXT",
    notNull: 1,
    defaultValue: "'normal'",
  });
  const statusChecks = checkExpressions(createSql).filter((check) =>
    check.includes("duplicate_status")
  );
  if (statusChecks.some((check) => check !== STATUS_CHECK)) {
    throw new Error("Existing duplicate_status CHECK is incompatible.");
  }
}

function assertDuplicateOfColumn(columns, foreignKeyRows) {
  assertColumn(columns, "duplicate_of", {
    type: "INTEGER",
    notNull: 0,
    defaultValue: "",
  });

  const refs = foreignKeyRows.filter(
    (fk) => String(fk.from) === "duplicate_of"
  );
  if (
    refs.length > 1 ||
    (refs.length === 1 &&
      (String(refs[0].table) !== "orders" ||
        String(refs[0].to) !== "id" ||
        String(refs[0].on_update).toUpperCase() !== "NO ACTION" ||
        String(refs[0].on_delete).toUpperCase() !== "RESTRICT"))
  ) {
    throw new Error("Existing duplicate_of reference is incompatible.");
  }
}

async function assertHistoryTable(db, object, allowMissingReviewer = false) {
  assertTable(object, "order_review_history");
  const columns = await tableColumns(db, "order_review_history");
  assertColumn(columns, "id", {
    type: "INTEGER",
    notNull: 0,
    defaultValue: "",
    primaryKey: 1,
  });
  assertColumn(columns, "order_id", {
    type: "INTEGER",
    notNull: 1,
    defaultValue: "",
  });
  assertColumn(columns, "previous_status", {
    type: "TEXT",
    notNull: 1,
    defaultValue: "",
  });
  assertColumn(columns, "new_status", {
    type: "TEXT",
    notNull: 1,
    defaultValue: "",
  });
  assertColumn(columns, "previous_duplicate_of", {
    type: "INTEGER",
    notNull: 0,
    defaultValue: "",
  });
  assertColumn(columns, "duplicate_of", {
    type: "INTEGER",
    notNull: 0,
    defaultValue: "",
  });
  const reviewedBy = columns.find(
    (column) => String(column.name) === "reviewed_by"
  );
  if (reviewedBy) {
    if (
      String(reviewedBy.type ?? "").toUpperCase() !== "TEXT" ||
      Number(reviewedBy.notnull) !== 1 ||
      normalizeSql(reviewedBy.dflt_value) !== "'unknown'"
    ) {
      throw new Error("Existing reviewed_by definition is incompatible.");
    }
  } else if (!allowMissingReviewer) {
    throw new Error("Required order_review_history column is missing: reviewed_by.");
  }

  const reviewedAt = columns.find(
    (column) => String(column.name) === "reviewed_at"
  );
  if (
    !reviewedAt ||
    String(reviewedAt.type ?? "").toUpperCase() !== "TEXT" ||
    Number(reviewedAt.notnull) !== 1 ||
    !["datetime('now')", "(datetime('now'))"].includes(
      normalizeSql(reviewedAt.dflt_value)
    )
  ) {
    throw new Error("Existing reviewed_at definition is incompatible.");
  }

  const checks = checkExpressions(object.sql);
  const historyChecks = checks.filter((check) => check.includes("new_status"));
  if (
    historyChecks.length !== 1 ||
    historyChecks[0] !== HISTORY_STATUS_CHECK
  ) {
    throw new Error("Existing order_review_history CHECK is incompatible.");
  }

  const keys = await foreignKeys(db, "order_review_history");
  const expectedKeys = [
    ["order_id", "orders", "id"],
    ["previous_duplicate_of", "orders", "id"],
    ["duplicate_of", "orders", "id"],
  ];
  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some(
      ([from, table, to]) =>
        !keys.some(
          (fk) =>
            String(fk.from) === from &&
            String(fk.table) === table &&
            String(fk.to) === to &&
            String(fk.on_update).toUpperCase() === "NO ACTION" &&
            String(fk.on_delete).toUpperCase() === "RESTRICT"
        )
    )
  ) {
    throw new Error("Existing order_review_history references are incompatible.");
  }
}

async function assertIndex(db, object, name, table, expectedColumns) {
  if (!object) return;
  if (String(object.type) !== "index" || String(object.tbl_name) !== table) {
    throw new Error(`Existing schema object has an incompatible name: ${name}.`);
  }

  const rows = await rowsFor(db, `PRAGMA index_list("${table}")`);
  const index = rows.find((row) => String(row.name) === name);
  const columns = await rowsFor(db, `PRAGMA index_info("${name}")`);
  if (
    !index ||
    Number(index.unique) !== 0 ||
    Number(index.partial) !== 0 ||
    columns.map((column) => String(column.name)).join(",") !==
      expectedColumns.join(",")
  ) {
    throw new Error(`Existing index has an incompatible definition: ${name}.`);
  }
}

async function count(db, sql) {
  const rows = await rowsFor(db, sql);
  return BigInt(String(rows[0]?.count ?? "0"));
}

async function assertNoOrphans(db, hasDuplicateOf, hasHistory) {
  const itemOrphans = await count(
    db,
    `SELECT COUNT(*) AS count
     FROM order_items AS item
     LEFT JOIN orders AS parent ON parent.id = item.order_id
     WHERE parent.id IS NULL`
  );
  if (itemOrphans !== 0n) {
    throw new Error("Existing order_items data contains orphan references.");
  }

  if (hasDuplicateOf) {
    const duplicateOrphans = await count(
      db,
      `SELECT COUNT(*) AS count
       FROM orders AS source
       LEFT JOIN orders AS target ON target.id = source.duplicate_of
       WHERE source.duplicate_of IS NOT NULL AND target.id IS NULL`
    );
    if (duplicateOrphans !== 0n) {
      throw new Error("Existing duplicate_of data contains orphan references.");
    }
  }

  if (hasHistory) {
    const historyOrphans = await count(
      db,
      `SELECT COUNT(*) AS count
       FROM order_review_history AS history
       LEFT JOIN orders AS reviewed ON reviewed.id = history.order_id
       LEFT JOIN orders AS previous_ref
         ON previous_ref.id = history.previous_duplicate_of
       LEFT JOIN orders AS current_ref ON current_ref.id = history.duplicate_of
       WHERE reviewed.id IS NULL
          OR (history.previous_duplicate_of IS NOT NULL
              AND previous_ref.id IS NULL)
          OR (history.duplicate_of IS NOT NULL AND current_ref.id IS NULL)`
    );
    if (historyOrphans !== 0n) {
      throw new Error("Existing review history contains orphan references.");
    }
  }
}

async function assertKnownStatuses(db, hasStatus) {
  if (!hasStatus) return;
  const invalidStatuses = await count(
    db,
    `SELECT COUNT(*) AS count
     FROM orders
     WHERE duplicate_status IS NULL
        OR duplicate_status NOT IN (
          'normal', 'pending_review', 'confirmed_new', 'confirmed_duplicate'
        )`
  );
  if (invalidStatuses !== 0n) {
    throw new Error("Existing orders contain an unknown duplicate status.");
  }
}

async function verifyFinalSchema(db) {
  const objects = await objectMap(db);
  await assertBaseSchema(db, objects);
  const orderColumns = await tableColumns(db, "orders");
  assertStatusColumn(orderColumns, objects.get("orders").sql);
  assertDuplicateOfColumn(orderColumns, await foreignKeys(db, "orders"));
  await assertHistoryTable(db, objects.get("order_review_history"));
  await assertIndex(
    db,
    objects.get("idx_orders_duplicate_status_created_at"),
    "idx_orders_duplicate_status_created_at",
    "orders",
    ["duplicate_status", "created_at"]
  );
  await assertIndex(
    db,
    objects.get("idx_orders_duplicate_of"),
    "idx_orders_duplicate_of",
    "orders",
    ["duplicate_of"]
  );
}

async function migrate() {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  const expectedHost = process.env.TURSO_MIGRATION_EXPECTED_HOST;
  assertExpectedHost(url, expectedHost);
  if (!token) throw new Error("TURSO_AUTH_TOKEN must be explicitly set.");

  const db = createClient({ url, authToken: token });
  try {
    const objects = await objectMap(db);
    await assertBaseSchema(db, objects);

    const ordersColumns = await tableColumns(db, "orders");
    const orderColumnNames = new Set(
      ordersColumns.map((column) => String(column.name))
    );
    const historyObject = objects.get("order_review_history");
    if (orderColumnNames.has("duplicate_status")) {
      assertStatusColumn(ordersColumns, objects.get("orders").sql);
    }
    if (orderColumnNames.has("duplicate_of")) {
      assertDuplicateOfColumn(
        ordersColumns,
        await foreignKeys(db, "orders")
      );
    }
    await assertKnownStatuses(
      db,
      orderColumnNames.has("duplicate_status")
    );
    if (historyObject) {
      await assertHistoryTable(db, historyObject, true);
    }
    await assertIndex(
      db,
      objects.get("idx_orders_duplicate_status_created_at"),
      "idx_orders_duplicate_status_created_at",
      "orders",
      ["duplicate_status", "created_at"]
    );
    await assertIndex(
      db,
      objects.get("idx_orders_duplicate_of"),
      "idx_orders_duplicate_of",
      "orders",
      ["duplicate_of"]
    );
    await assertNoOrphans(
      db,
      orderColumnNames.has("duplicate_of"),
      Boolean(historyObject)
    );
    const foreignKeyState = await rowsFor(db, "PRAGMA foreign_keys");
    if (Number(foreignKeyState[0]?.foreign_keys ?? 0) !== 1) {
      console.warn(
        "This connection reports foreign-key enforcement disabled; declared references alone do not protect direct writes."
      );
    }

    const baseline = {
      orders: await count(db, "SELECT COUNT(*) AS count FROM orders"),
      orderItems: await count(
        db,
        "SELECT COUNT(*) AS count FROM order_items"
      ),
      history: historyObject
        ? await count(
            db,
            "SELECT COUNT(*) AS count FROM order_review_history"
          )
        : 0n,
    };

    if (!orderColumnNames.has("duplicate_status")) {
      await db.execute(`
        ALTER TABLE orders
        ADD COLUMN duplicate_status TEXT NOT NULL DEFAULT 'normal'
      `);
    }
    if (!orderColumnNames.has("duplicate_of")) {
      await db.execute("ALTER TABLE orders ADD COLUMN duplicate_of INTEGER");
    }
    if (!historyObject) {
      await db.execute(`
        CREATE TABLE order_review_history (
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
    }
    if (historyObject) {
      const historyColumns = await tableColumns(db, "order_review_history");
      if (!historyColumns.some((column) => String(column.name) === "reviewed_by")) {
        await db.execute(`
          ALTER TABLE order_review_history
          ADD COLUMN reviewed_by TEXT NOT NULL DEFAULT 'unknown'
        `);
      }
    }

    let currentObjects = await objectMap(db);
    if (!currentObjects.has("idx_orders_duplicate_status_created_at")) {
      await db.execute(`
        CREATE INDEX idx_orders_duplicate_status_created_at
        ON orders(duplicate_status, created_at)
      `);
    }
    currentObjects = await objectMap(db);
    if (!currentObjects.has("idx_orders_duplicate_of")) {
      await db.execute(`
        CREATE INDEX idx_orders_duplicate_of ON orders(duplicate_of)
      `);
    }

    await verifyFinalSchema(db);
    await assertNoOrphans(db, true, true);
    const finalCounts = {
      orders: await count(db, "SELECT COUNT(*) AS count FROM orders"),
      orderItems: await count(
        db,
        "SELECT COUNT(*) AS count FROM order_items"
      ),
      history: await count(
        db,
        "SELECT COUNT(*) AS count FROM order_review_history"
      ),
    };
    if (
      baseline.orders !== finalCounts.orders ||
      baseline.orderItems !== finalCounts.orderItems ||
      baseline.history !== finalCounts.history
    ) {
      throw new Error("A row count changed during the additive migration.");
    }

    console.info("Turso duplicate-review schema is verified; row counts are unchanged.");
  } finally {
    await db.close();
  }
}

migrate().catch((error) => {
  let message =
    error instanceof Error ? error.message : "Unexpected migration error.";
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  for (const secret of [url, token]) {
    if (secret) message = message.split(secret).join("[redacted]");
  }
  console.error(`Turso migration stopped: ${message}`);
  process.exitCode = 1;
});
