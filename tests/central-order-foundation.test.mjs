import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { applyCentralOrderMigrations } from "../scripts/central-order-migrations.mjs";

async function removeTemporaryDirectory(directory, t) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 19) {
        t.diagnostic(
          `Could not remove isolated migration fixture: ${error.message}`
        );
      } else {
        await new Promise((resolveWait) => setTimeout(resolveWait, 250));
      }
    }
  }
}

async function createFixture(t, prefix) {
  const directory = await mkdtemp(resolve(tmpdir(), prefix));
  const databasePath = resolve(directory, "fixture.db");
  const db = createClient({ url: `file:${databasePath}` });
  t.after(async () => {
    await db.close();
    await removeTemporaryDirectory(directory, t);
  });
  return db;
}

async function createLegacySchema(db) {
  await db.execute(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      governorate TEXT NOT NULL,
      phone TEXT NOT NULL,
      phone2 TEXT NOT NULL,
      product_id TEXT NOT NULL,
      designation TEXT NOT NULL,
      qty INTEGER NOT NULL,
      item_price INTEGER NOT NULL,
      delivery_fee INTEGER NOT NULL,
      total INTEGER NOT NULL,
      exported_at TEXT,
      duplicate_status TEXT NOT NULL DEFAULT 'normal',
      duplicate_of INTEGER
    )
  `);
  await db.execute(`
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      color TEXT NOT NULL,
      size TEXT NOT NULL,
      qty INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      line_total INTEGER NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE order_review_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      previous_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      reviewed_at TEXT NOT NULL
    )
  `);
}

async function insertLegacyRecords(db) {
  for (const [id, name] of [
    [41, "Legacy order one"],
    [42, "Legacy order two"],
  ]) {
    await db.execute({
      sql: `
        INSERT INTO orders (
          id, created_at, name, address, city, governorate, phone, phone2,
          product_id, designation, qty, item_price, delivery_fee, total,
          exported_at, duplicate_status, duplicate_of
        ) VALUES (?, '2026-01-02 03:04:05', ?, 'Synthetic address',
          'ARIANA VILLE', 'Ariana', '21234567', '29876543',
          'legacy-product', 'Legacy product', 2, 60, 8, 68,
          '2026-01-03 04:05:06', 'normal', NULL)
      `,
      args: [id, name],
    });
  }
  await db.execute(`
    INSERT INTO order_items (
      id, order_id, product_id, product_name, color, size, qty, unit_price,
      line_total
    ) VALUES (9, 41, 'legacy-product', 'Legacy product', 'Blue', 'M', 2, 30, 60)
  `);
  await db.execute(`
    INSERT INTO order_review_history (
      id, order_id, previous_status, new_status, reviewed_at
    ) VALUES (7, 41, 'pending_review', 'confirmed_new', '2026-01-04 05:06:07')
  `);
}

test("fresh initialized database gets versioned foundation and can be migrated twice", async (t) => {
  const db = await createFixture(t, "fasrod-central-fresh-");
  await db.execute(`
    CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT)
  `);

  assert.deepEqual(await applyCentralOrderMigrations(db), [1]);
  assert.deepEqual(await applyCentralOrderMigrations(db), []);

  const ledger = await db.execute(
    "SELECT version, name FROM schema_migrations ORDER BY version"
  );
  assert.deepEqual(
    ledger.rows.map((row) => [Number(row.version), String(row.name)]),
    [[1, "central-order-foundation"]]
  );
  const orderColumns = await db.execute("PRAGMA table_info(orders)");
  const orderColumnNames = new Set(
    orderColumns.rows.map((row) => String(row.name))
  );
  assert.ok(orderColumnNames.has("customer_id"));
  assert.ok(orderColumnNames.has("source"));

  const foreignKeys = await db.execute("PRAGMA foreign_keys");
  assert.equal(Number(foreignKeys.rows[0].foreign_keys), 1);
});

test("legacy migration preserves order, item and review values without inferring identity or source", async (t) => {
  const db = await createFixture(t, "fasrod-central-legacy-");
  await createLegacySchema(db);
  await insertLegacyRecords(db);

  const before = {
    orders: await db.execute(`
      SELECT id, created_at, name, address, city, governorate, phone, phone2,
        product_id, designation, qty, item_price, delivery_fee, total,
        exported_at, duplicate_status, duplicate_of
      FROM orders ORDER BY id
    `),
    items: await db.execute("SELECT * FROM order_items ORDER BY id"),
    reviewHistory: await db.execute(
      "SELECT * FROM order_review_history ORDER BY id"
    ),
  };

  await applyCentralOrderMigrations(db);

  const after = {
    orders: await db.execute(`
      SELECT id, created_at, name, address, city, governorate, phone, phone2,
        product_id, designation, qty, item_price, delivery_fee, total,
        exported_at, duplicate_status, duplicate_of
      FROM orders ORDER BY id
    `),
    items: await db.execute("SELECT * FROM order_items ORDER BY id"),
    reviewHistory: await db.execute(
      "SELECT * FROM order_review_history ORDER BY id"
    ),
  };
  assert.deepEqual(after, before);

  const migratedOrders = await db.execute(
    "SELECT customer_id, source FROM orders ORDER BY id"
  );
  assert.deepEqual(
    migratedOrders.rows.map((row) => [
      row.customer_id,
      String(row.source),
    ]),
    [
      [null, "legacy_unknown"],
      [null, "legacy_unknown"],
    ]
  );
  const customers = await db.execute("SELECT COUNT(*) AS count FROM customers");
  assert.equal(Number(customers.rows[0].count), 0);
});

test("customer phones allow several numbers per customer and shared normalized numbers", async (t) => {
  const db = await createFixture(t, "fasrod-central-phones-");
  await createLegacySchema(db);
  await applyCentralOrderMigrations(db);
  const first = await db.execute({
    sql: "INSERT INTO customers (display_name) VALUES (?)",
    args: ["Synthetic customer one"],
  });
  const second = await db.execute({
    sql: "INSERT INTO customers (display_name) VALUES (?)",
    args: ["Synthetic customer two"],
  });
  const firstId = Number(first.lastInsertRowid);
  const secondId = Number(second.lastInsertRowid);

  for (const [customerId, phone, normalized] of [
    [firstId, "+216 12 345 678", "12345678"],
    [firstId, "29 876 543", "29876543"],
    [secondId, "12-345-678", "12345678"],
  ]) {
    await db.execute({
      sql: `
        INSERT INTO customer_phones (customer_id, phone, normalized_phone)
        VALUES (?, ?, ?)
      `,
      args: [customerId, phone, normalized],
    });
  }

  const shared = await db.execute({
    sql: `
      SELECT COUNT(DISTINCT customer_id) AS count
      FROM customer_phones
      WHERE normalized_phone = '12345678'
    `,
  });
  assert.equal(Number(shared.rows[0].count), 2);
  await assert.rejects(
    db.execute({
      sql: `
        INSERT INTO customer_phones (customer_id, phone, normalized_phone)
        VALUES (?, ?, ?)
      `,
      args: [firstId, "12 345 678", "12345678"],
    }),
    /UNIQUE constraint failed/
  );
});

test("order and activity constraints enforce foreign keys, allowed sources, JSON and legacy idempotency", async (t) => {
  const db = await createFixture(t, "fasrod-central-constraints-");
  await db.execute(`
    CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT)
  `);
  await applyCentralOrderMigrations(db);

  await db.execute("INSERT INTO orders (id) VALUES (10)");
  await db.execute("INSERT INTO orders (id, source) VALUES (11, 'website')");
  for (const source of ["instagram", "admin", "legacy_unknown"]) {
    await db.execute({
      sql: "INSERT INTO orders (source) VALUES (?)",
      args: [source],
    });
  }
  const customer = await db.execute({
    sql: "INSERT INTO customers (display_name) VALUES (?)",
    args: ["Synthetic linked customer"],
  });
  const customerId = Number(customer.lastInsertRowid);
  await db.execute({
    sql: "INSERT INTO orders (customer_id, source) VALUES (?, 'admin')",
    args: [customerId],
  });
  await assert.rejects(
    db.execute("INSERT INTO orders (source) VALUES ('unknown')"),
    /CHECK constraint failed/
  );
  await assert.rejects(
    db.execute("INSERT INTO orders (id, customer_id) VALUES (20, 999)"),
    /FOREIGN KEY constraint failed/
  );
  await assert.rejects(
    db.execute(`
      INSERT INTO customer_phones (customer_id, phone, normalized_phone)
      VALUES (999, '21234567', '21234567')
    `),
    /FOREIGN KEY constraint failed/
  );

  await db.execute({
    sql: `
      INSERT INTO order_activity (
        order_id, event_type, actor_type, staff_identifier, details_json,
        legacy_source, legacy_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      10,
      "legacy_review",
      "legacy",
      null,
      JSON.stringify({ oldReviewer: "admin", decision: "approved" }),
      "order_review_history",
      "7",
    ],
  });
  await db.execute({
    sql: `
      INSERT INTO order_activity (order_id, event_type, actor_type)
      VALUES (?, ?, ?)
    `,
    args: [11, "created", "system"],
  });
  await db.execute({
    sql: `
      INSERT INTO order_activity (
        order_id, event_type, actor_type, staff_identifier
      ) VALUES (?, ?, ?, ?)
    `,
    args: [11, "approved", "staff", "staff-17"],
  });
  await assert.rejects(
    db.execute({
      sql: `
        INSERT INTO order_activity (order_id, event_type, actor_type)
        VALUES (?, ?, ?)
      `,
      args: [11, "invalid actor", "administrator"],
    }),
    /CHECK constraint failed/
  );
  await assert.rejects(
    db.execute({
      sql: `
        INSERT INTO order_activity (order_id, event_type, actor_type)
        VALUES (?, ?, ?)
      `,
      args: [999, "created", "system"],
    }),
    /FOREIGN KEY constraint failed/
  );
  await assert.rejects(
    db.execute({
      sql: `
        INSERT INTO order_activity (
          order_id, event_type, actor_type, details_json
        ) VALUES (?, ?, ?, ?)
      `,
      args: [10, "created", "system", "{invalid"],
    }),
    /CHECK constraint failed/
  );
  await assert.rejects(
    db.execute({
      sql: `
        INSERT INTO order_activity (
          order_id, event_type, actor_type, legacy_source, legacy_id
        ) VALUES (?, ?, ?, ?, ?)
      `,
      args: [10, "legacy_review", "legacy", "order_review_history", "7"],
    }),
    /UNIQUE constraint failed/
  );

  const event = await db.execute(
    "SELECT actor_type, details_json FROM order_activity WHERE order_id = 10"
  );
  assert.equal(event.rows[0].actor_type, "legacy");
  assert.deepEqual(JSON.parse(String(event.rows[0].details_json)), {
    oldReviewer: "admin",
    decision: "approved",
  });
  const futureActors = await db.execute(`
    SELECT actor_type, staff_identifier
    FROM order_activity
    WHERE order_id = 11
    ORDER BY id
  `);
  assert.deepEqual(
    futureActors.rows.map((row) => [
      String(row.actor_type),
      row.staff_identifier,
    ]),
    [
      ["system", null],
      ["staff", "staff-17"],
    ]
  );
});
