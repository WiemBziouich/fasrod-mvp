import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localMigration = resolve(
  projectRoot,
  "scripts",
  "migrate-duplicate-review.mjs"
);
const tursoMigration = resolve(
  projectRoot,
  "scripts",
  "migrate-duplicate-review-turso.mjs"
);
const exportBatchMigration = resolve(
  projectRoot,
  "scripts",
  "migrate-export-batches.mjs"
);
const nextCli = resolve(projectRoot, "node_modules", "next", "dist", "bin", "next");
const adminAuthorization = `Basic ${Buffer.from(
  "admin:synthetic-review-test"
).toString("base64")}`;

function safeEnvironment(extra = {}) {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    TURSO_DATABASE_URL: "file:data/orders.db",
    TURSO_AUTH_TOKEN: "",
    ADMIN_PASSWORD: "synthetic-review-test",
    NEXT_TELEMETRY_DISABLED: "1",
    ...extra,
  };
  return Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined)
  );
}

function fetchTest(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20_000),
  });
}

async function unusedPort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose()))
  );
  return port;
}

async function waitForServer(url, child, getOutput) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js test server exited early (${child.exitCode}).`);
    }
    try {
      const response = await fetchTest(url);
      if (response.ok) return;
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  void getOutput();
  throw new Error("Next.js test server did not become ready in time.");
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const closed = new Promise((resolveClose) => child.once("close", resolveClose));
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Stop-Process -Id ${Number(child.pid)} -Force -ErrorAction SilentlyContinue`,
    ],
    { stdio: "ignore" }
  );
  await Promise.race([
    closed,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Next.js test server did not stop.")), 10_000)
    ),
  ]);
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
}

test("remote migration rejects local URLs and unconfirmed hosts before connecting", () => {
  const secret = "synthetic-only-token";
  const localUrl = "file:data/orders.db";
  const localAttempt = spawnSync(
    process.execPath,
    [tursoMigration],
    {
      env: safeEnvironment({
        TURSO_DATABASE_URL: localUrl,
        TURSO_AUTH_TOKEN: secret,
        TURSO_MIGRATION_EXPECTED_HOST: "preproduction.example",
      }),
      encoding: "utf8",
    }
  );
  const localOutput = `${localAttempt.stdout}${localAttempt.stderr}`;
  assert.equal(localAttempt.status, 1);
  assert.match(localOutput, /Refusing a file URL/);
  assert.doesNotMatch(localOutput, new RegExp(secret));
  assert.equal(localOutput.includes(localUrl), false);

  const mismatchAttempt = spawnSync(process.execPath, [tursoMigration], {
    env: safeEnvironment({
      TURSO_DATABASE_URL: "libsql://preproduction.example",
      TURSO_AUTH_TOKEN: secret,
      TURSO_MIGRATION_EXPECTED_HOST: "different.example",
    }),
    encoding: "utf8",
  });
  const mismatchOutput = `${mismatchAttempt.stdout}${mismatchAttempt.stderr}`;
  assert.equal(mismatchAttempt.status, 1);
  assert.match(mismatchOutput, /does not exactly match/);
  assert.doesNotMatch(mismatchOutput, new RegExp(secret));
});

test(
  "duplicate detection, review, exports, cleanup, and migration use isolated synthetic SQLite",
  { timeout: 240_000 },
  async (t) => {
    const originalCwd = process.cwd();
    const tempRoot = await mkdtemp(resolve(tmpdir(), "fasrod-duplicate-review-"));
    await mkdir(resolve(tempRoot, "data"), { recursive: true });
    process.chdir(tempRoot);
    const db = createClient({ url: "file:data/orders.db" });
    let serverProcess;
    let serverOutput = "";

    try {
      await db.execute(`
        CREATE TABLE orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          name TEXT NOT NULL,
          address TEXT NOT NULL,
          city TEXT NOT NULL,
          governorate TEXT NOT NULL,
          phone TEXT NOT NULL,
          phone2 TEXT NOT NULL,
          product_id TEXT NOT NULL,
          designation TEXT NOT NULL,
          qty INTEGER NOT NULL,
          item_price REAL NOT NULL,
          delivery_fee REAL NOT NULL,
          total REAL NOT NULL,
          exported_at TEXT
        )
      `);
      await db.execute(`
        CREATE TABLE rate_limits (
          key TEXT PRIMARY KEY,
          window_start INTEGER NOT NULL,
          count INTEGER NOT NULL
        )
      `);
      await db.execute(`
        CREATE TABLE order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          product_id TEXT NOT NULL,
          product_name TEXT NOT NULL,
          color TEXT NOT NULL,
          size TEXT NOT NULL,
          qty INTEGER NOT NULL,
          unit_price REAL NOT NULL,
          line_total REAL NOT NULL
        )
      `);
      await db.execute(`
        CREATE TABLE products (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          price REAL NOT NULL,
          desc_fr TEXT NOT NULL,
          desc_ar TEXT NOT NULL,
          images TEXT NOT NULL,
          colors TEXT NOT NULL,
          sizes TEXT NOT NULL,
          active INTEGER NOT NULL
        )
      `);
      await db.execute({
        sql: `INSERT INTO products
          (id, name, category, price, desc_fr, desc_ar, images, colors, sizes, active)
          VALUES (?, ?, ?, ?, '', '', '[]', ?, ?, 1)`,
        args: [
          "synthetic-shirt",
          "Synthetic Shirt",
          "Test",
          30,
          JSON.stringify([{ name: "Black", hex: "#000000" }]),
          JSON.stringify(["M", "L"]),
        ],
      });
      await db.execute({
        sql: `INSERT INTO products
          (id, name, category, price, desc_fr, desc_ar, images, colors, sizes, active)
          VALUES (?, ?, ?, ?, '', '', '[]', ?, ?, 1)`,
        args: [
          "synthetic-pants",
          "Synthetic Pants",
          "Test",
          40,
          JSON.stringify([{ name: "Blue", hex: "#0000ff" }]),
          JSON.stringify(["M", "L"]),
        ],
      });

      for (let index = 0; index < 205; index += 1) {
        const order = await db.execute({
          sql: `INSERT INTO orders (
            name, address, city, governorate, phone, phone2,
            product_id, designation, qty, item_price, delivery_fee, total, exported_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `Synthetic historical ${index}`,
            "Synthetic address",
            "ARIANA VILLE",
            "Ariana",
            `7000${String(index).padStart(4, "0")}`,
            `7000${String(index).padStart(4, "0")}`,
            "synthetic-shirt",
            "Synthetic item",
            1,
            30,
            8,
            38,
            "2026-10-25 00:00:00",
          ],
        });
        if (index === 0) {
          await db.execute({
            sql: `INSERT INTO order_items (
              order_id, product_id, product_name, color, size, qty, unit_price, line_total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              Number(order.lastInsertRowid),
              "synthetic-shirt",
              "Synthetic Shirt",
              "Black",
              "M",
              1,
              30,
              30,
            ],
          });
        }
      }
      const beforeMigration = {
        orders: Number(
          (await db.execute("SELECT COUNT(*) AS n FROM orders")).rows[0].n
        ),
        items: Number(
          (await db.execute("SELECT COUNT(*) AS n FROM order_items")).rows[0].n
        ),
        firstOrder: (
          await db.execute("SELECT id, exported_at FROM orders ORDER BY id LIMIT 1")
        ).rows[0],
        firstItem: (
          await db.execute("SELECT * FROM order_items ORDER BY id LIMIT 1")
        ).rows[0],
      };

      const migrationEnv = safeEnvironment({
        TURSO_DATABASE_URL: "file:data/orders.db",
        TURSO_AUTH_TOKEN: "",
      });
      const firstMigration = spawnSync(
        process.execPath,
        [localMigration],
        { cwd: tempRoot, env: migrationEnv, encoding: "utf8" }
      );
      assert.equal(firstMigration.status, 0, "first additive migration succeeds");
      const secondMigration = spawnSync(
        process.execPath,
        [localMigration],
        { cwd: tempRoot, env: migrationEnv, encoding: "utf8" }
      );
      assert.equal(secondMigration.status, 0, "migration replay succeeds");
      const firstExportMigration = spawnSync(
        process.execPath,
        [exportBatchMigration],
        { cwd: tempRoot, env: migrationEnv, encoding: "utf8" }
      );
      assert.equal(
        firstExportMigration.status,
        0,
        "first export-batch migration succeeds"
      );
      const secondExportMigration = spawnSync(
        process.execPath,
        [exportBatchMigration],
        { cwd: tempRoot, env: migrationEnv, encoding: "utf8" }
      );
      assert.equal(
        secondExportMigration.status,
        0,
        "export-batch migration replay succeeds"
      );
      const remoteMigrationAttempt = spawnSync(
        process.execPath,
        [exportBatchMigration],
        {
          cwd: tempRoot,
          env: safeEnvironment({
            TURSO_DATABASE_URL: "libsql://invalid.invalid",
            ALLOW_REMOTE: "1",
          }),
          encoding: "utf8",
        }
      );
      assert.notEqual(
        remoteMigrationAttempt.status,
        0,
        "export-batch migration refuses all remote URLs"
      );
      t.diagnostic("Temporary schema migrations executed twice; remote URL rejected.");

      const afterMigration = {
        orders: Number(
          (await db.execute("SELECT COUNT(*) AS n FROM orders")).rows[0].n
        ),
        items: Number(
          (await db.execute("SELECT COUNT(*) AS n FROM order_items")).rows[0].n
        ),
        firstOrder: (
          await db.execute(
            `SELECT id, exported_at, duplicate_status, export_batch_id,
                    import_confirmed_at
             FROM orders ORDER BY id LIMIT 1`
          )
        ).rows[0],
        firstItem: (
          await db.execute("SELECT * FROM order_items ORDER BY id LIMIT 1")
        ).rows[0],
      };
      assert.equal(afterMigration.orders, beforeMigration.orders);
      assert.equal(afterMigration.items, beforeMigration.items);
      assert.equal(Number(afterMigration.firstOrder.id), Number(beforeMigration.firstOrder.id));
      assert.equal(afterMigration.firstOrder.exported_at, beforeMigration.firstOrder.exported_at);
      assert.equal(afterMigration.firstOrder.duplicate_status, "normal");
      assert.deepEqual(
        Object.fromEntries(
          Object.keys(beforeMigration.firstItem).map((key) => [
            key,
            afterMigration.firstItem[key],
          ])
        ),
        Object.fromEntries(
          Object.keys(beforeMigration.firstItem).map((key) => [
            key,
            beforeMigration.firstItem[key],
          ])
        )
      );

      const oldCandidateId = Number(
        (
          await db.execute(
            "SELECT id FROM orders ORDER BY id LIMIT 1"
          )
        ).rows[0].id
      );
      const recentCandidate = await db.execute({
        sql: `INSERT INTO orders (
          name, address, city, governorate, phone, phone2, product_id,
          designation, qty, item_price, delivery_fee, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "Synthetic review candidate",
          "Synthetic address",
          "ARIANA VILLE",
          "Ariana",
          "11112222",
          "33334444",
          "synthetic-shirt",
          "Synthetic Shirt",
          1,
          30,
          8,
          38,
        ],
      });
      const recentCandidateId = Number(recentCandidate.lastInsertRowid);
      await db.execute({
        sql: `UPDATE orders SET duplicate_status = 'pending_review', duplicate_of = ?
              WHERE id = ?`,
        args: [recentCandidateId, oldCandidateId],
      });
      const port = await unusedPort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const nodeArgs = [
        nextCli,
        "dev",
        projectRoot,
        "-H",
        "127.0.0.1",
        "-p",
        String(port),
      ];
      serverProcess = spawn(
        process.execPath,
        nodeArgs,
        {
          cwd: tempRoot,
          env: migrationEnv,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        }
      );
      serverProcess.stdout.setEncoding("utf8").on("data", (chunk) => {
        serverOutput = `${serverOutput}${chunk}`.slice(-8000);
      });
      serverProcess.stderr.setEncoding("utf8").on("data", (chunk) => {
        serverOutput = `${serverOutput}${chunk}`.slice(-8000);
      });
      await waitForServer(`${baseUrl}/api/products`, serverProcess, () => serverOutput);
      t.diagnostic("Isolated Next.js server is ready.");

      const postOrder = async (phone, items, phone2 = phone, name = "Synthetic Buyer") => {
        const response = await fetchTest(`${baseUrl}/api/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            address: "Synthetic address",
            city: "ARIANA VILLE",
            governorate: "Ariana",
            phone,
            phone2,
            items,
          }),
        });
        return { response, body: await response.json() };
      };
      const shirt = {
        productId: "synthetic-shirt",
        color: "Black",
        size: "M",
        qty: 1,
      };
      const pants = {
        productId: "synthetic-pants",
        color: "Blue",
        size: "L",
        qty: 1,
      };

      const first = await postOrder("+216 20-000-001", [shirt]);
      assert.equal(first.response.status, 200);
      assert.equal(
        (
          await db.execute({
            sql: "SELECT duplicate_status FROM orders WHERE id = ?",
            args: [first.body.id],
          })
        ).rows[0].duplicate_status,
        "normal"
      );

      const exact = await postOrder("00216 20 000 001", [shirt]);
      assert.equal(exact.response.status, 200);
      assert.equal(
        (
          await db.execute({
            sql: "SELECT duplicate_status, duplicate_of FROM orders WHERE id = ?",
            args: [exact.body.id],
          })
        ).rows[0].duplicate_status,
        "pending_review"
      );
      assert.equal(
        Number(
          (
            await db.execute({
              sql: "SELECT duplicate_of FROM orders WHERE id = ?",
              args: [exact.body.id],
            })
          ).rows[0].duplicate_of
        ),
        first.body.id
      );
      assert.equal(
        Number(
          (
            await db.execute({
              sql: "SELECT COUNT(*) AS n FROM order_items WHERE order_id = ?",
              args: [exact.body.id],
            })
          ).rows[0].n
        ),
        1
      );

      const differentPhone = await postOrder("20000002", [shirt]);
      assert.equal(differentPhone.response.status, 200);
      assert.equal(
        (
          await db.execute({
            sql: "SELECT duplicate_status FROM orders WHERE id = ?",
            args: [differentPhone.body.id],
          })
        ).rows[0].duplicate_status,
        "normal"
      );
      const differentProduct = await postOrder("+216 20 000 001", [pants]);
      assert.equal(differentProduct.response.status, 200);
      assert.equal(
        (
          await db.execute({
            sql: "SELECT duplicate_status FROM orders WHERE id = ?",
            args: [differentProduct.body.id],
          })
        ).rows[0].duplicate_status,
        "normal"
      );

      const secondaryBase = await postOrder("21000001", [shirt], "22000001");
      const secondaryMatch = await postOrder("23000001", [shirt], "21000001");
      assert.equal(secondaryBase.response.status, 200);
      assert.equal(secondaryMatch.response.status, 200);
      assert.equal(
        (
          await db.execute({
            sql: "SELECT duplicate_status FROM orders WHERE id = ?",
            args: [secondaryMatch.body.id],
          })
        ).rows[0].duplicate_status,
        "pending_review"
      );

      const cartBase = await postOrder("24000001", [shirt, pants]);
      const reversedCart = await postOrder("24000001", [pants, shirt]);
      assert.equal(cartBase.response.status, 200);
      assert.equal(reversedCart.response.status, 200);
      assert.equal(
        (
          await db.execute({
            sql: "SELECT duplicate_status FROM orders WHERE id = ?",
            args: [reversedCart.body.id],
          })
        ).rows[0].duplicate_status,
        "pending_review"
      );

      const oldOrder = await db.execute({
        sql: `INSERT INTO orders (
          created_at, name, address, city, governorate, phone, phone2,
          product_id, designation, qty, item_price, delivery_fee, total
        ) VALUES (datetime('now', '-31 days'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "Synthetic old candidate",
          "Synthetic address",
          "ARIANA VILLE",
          "Ariana",
          "25000001",
          "25000001",
          "synthetic-shirt",
          "Synthetic Shirt",
          1,
          30,
          8,
          38,
        ],
      });
      await db.execute({
        sql: `INSERT INTO order_items (
          order_id, product_id, product_name, color, size, qty, unit_price, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          Number(oldOrder.lastInsertRowid),
          "synthetic-shirt",
          "Synthetic Shirt",
          "Black",
          "M",
          1,
          30,
          30,
        ],
      });
      const pastWindow = await postOrder("25000001", [shirt]);
      assert.equal(pastWindow.response.status, 200);
      assert.equal(
        (
          await db.execute({
            sql: "SELECT duplicate_status FROM orders WHERE id = ?",
            args: [pastWindow.body.id],
          })
        ).rows[0].duplicate_status,
        "normal"
      );
      t.diagnostic("Order detection scenarios passed.");

      const unauthenticated = await fetchTest(`${baseUrl}/api/admin/orders/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      assert.equal(unauthenticated.status, 401);

      const invalidReview = await fetchTest(`${baseUrl}/api/admin/orders/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: adminAuthorization,
        },
        body: JSON.stringify({ orderId: exact.body.id, status: "deleted" }),
      });
      assert.equal(invalidReview.status, 400);
      const invalidCandidate = await fetchTest(`${baseUrl}/api/admin/orders/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: adminAuthorization,
        },
        body: JSON.stringify({
          orderId: exact.body.id,
          status: "confirmed_duplicate",
          duplicateOf: differentPhone.body.id,
        }),
      });
      assert.equal(invalidCandidate.status, 400);

      const adminPage = await fetchTest(`${baseUrl}/admin/commandes`, {
        headers: { Authorization: adminAuthorization },
      });
      assert.equal(adminPage.status, 200);
      const adminHtml = await adminPage.text();
      assert.match(adminHtml, /Synthetic historical 0/);
      assert.match(adminHtml, /Téléphone correspondant :/);
      assert.match(adminHtml, /Panier identique :/);
      t.diagnostic("Authenticated review queue and access controls passed.");

      const keepPending = await fetchTest(`${baseUrl}/api/admin/orders/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: adminAuthorization,
        },
        body: JSON.stringify({
          orderId: exact.body.id,
          status: "pending_review",
        }),
      });
      assert.equal(keepPending.status, 200);
      assert.equal(
        (
          await db.execute({
            sql: "SELECT duplicate_status FROM orders WHERE id = ?",
            args: [exact.body.id],
          })
        ).rows[0].duplicate_status,
        "pending_review"
      );
      const keepHistory = await db.execute({
        sql: "SELECT * FROM order_review_history WHERE order_id = ? ORDER BY id",
        args: [exact.body.id],
      });
      assert.equal(keepHistory.rows.length, 1);
      assert.equal(keepHistory.rows[0].reviewed_by, "admin");
      assert.equal(keepHistory.rows[0].previous_status, "pending_review");
      assert.equal(keepHistory.rows[0].new_status, "pending_review");

      const confirmNew = await fetchTest(`${baseUrl}/api/admin/orders/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: adminAuthorization,
        },
        body: JSON.stringify({
          orderId: exact.body.id,
          status: "confirmed_new",
        }),
      });
      assert.equal(confirmNew.status, 200);
      assert.equal(
        (
          await db.execute({
            sql: "SELECT duplicate_status, duplicate_of FROM orders WHERE id = ?",
            args: [exact.body.id],
          })
        ).rows[0].duplicate_status,
        "confirmed_new"
      );
      assert.equal(
        (
          await db.execute({
            sql: "SELECT COUNT(*) AS n FROM order_review_history WHERE order_id = ?",
            args: [exact.body.id],
          })
        ).rows[0].n,
        2
      );

      const confirmDuplicate = await fetchTest(`${baseUrl}/api/admin/orders/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: adminAuthorization,
        },
        body: JSON.stringify({
          orderId: secondaryMatch.body.id,
          status: "confirmed_duplicate",
          duplicateOf: secondaryBase.body.id,
        }),
      });
      assert.equal(confirmDuplicate.status, 200);
      assert.equal(
        (
          await db.execute({
            sql: "SELECT duplicate_status FROM orders WHERE id = ?",
            args: [secondaryMatch.body.id],
          })
        ).rows[0].duplicate_status,
        "confirmed_duplicate"
      );
      const duplicateHistory = await db.execute({
        sql: "SELECT * FROM order_review_history WHERE order_id = ?",
        args: [secondaryMatch.body.id],
      });
      assert.equal(Number(duplicateHistory.rows[0].duplicate_of), secondaryBase.body.id);
      assert.equal(duplicateHistory.rows[0].reviewed_by, "admin");
      t.diagnostic("Review decisions and history persistence passed.");

      await db.execute(
        "UPDATE orders SET exported_at = '2026-10-25 00:00:00'"
      );
      const exportNormal = await db.execute({
        sql: `INSERT INTO orders (
          name, address, city, governorate, phone, phone2, product_id,
          designation, qty, item_price, delivery_fee, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "=SYNTHETIC",
          "Synthetic; address",
          "ARIANA VILLE",
          "Ariana",
          "26000001",
          "26000001",
          "synthetic-shirt",
          "Synthetic\r\nitem",
          1,
          30,
          8,
          38,
        ],
      });
      const exportNew = await db.execute({
        sql: `INSERT INTO orders (
          name, address, city, governorate, phone, phone2, product_id,
          designation, qty, item_price, delivery_fee, total, duplicate_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "Synthetic confirmed",
          "Synthetic address",
          "ARIANA VILLE",
          "Ariana",
          "26000002",
          "26000002",
          "synthetic-shirt",
          "Synthetic Shirt",
          1,
          30,
          8,
          38,
          "confirmed_new",
        ],
      });
      const pendingExport = await db.execute({
        sql: `INSERT INTO orders (
          name, address, city, governorate, phone, phone2, product_id,
          designation, qty, item_price, delivery_fee, total, duplicate_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "Synthetic pending",
          "Synthetic address",
          "ARIANA VILLE",
          "Ariana",
          "26000003",
          "26000003",
          "synthetic-shirt",
          "Synthetic Shirt",
          1,
          30,
          8,
          38,
          "pending_review",
        ],
      });
      const duplicateExport = await db.execute({
        sql: `INSERT INTO orders (
          name, address, city, governorate, phone, phone2, product_id,
          designation, qty, item_price, delivery_fee, total, duplicate_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "Synthetic duplicate",
          "Synthetic address",
          "ARIANA VILLE",
          "Ariana",
          "26000004",
          "26000004",
          "synthetic-shirt",
          "Synthetic Shirt",
          1,
          30,
          8,
          38,
          "confirmed_duplicate",
        ],
      });

      const normalExportResponse = await fetchTest(`${baseUrl}/api/admin/export`, {
        headers: { Authorization: adminAuthorization },
      });
      assert.equal(normalExportResponse.status, 200);
      const normalCsv = await normalExportResponse.text();
      const expectedHeader =
        "destinataire_nom;adresse;ville;gouvernerat;telephone;telephone2;nombre_de_colis;prix;designation";
      assert.equal(normalCsv.split("\r\n")[0], expectedHeader);
      assert.equal(normalCsv.split("\r\n").length, 3);
      assert.doesNotMatch(normalCsv, /(?<!\r)\n/);
      assert.match(normalCsv, /'=?SYNTHETIC/);
      assert.match(normalCsv, /Synthetic confirmed/);
      assert.match(normalCsv, /Synthetic  address/);
      assert.match(normalCsv, /Synthetic item/);
      assert.doesNotMatch(normalCsv, /Synthetic pending|Synthetic duplicate/);
      assert.match(
        normalExportResponse.headers.get("content-disposition"),
        /^attachment; filename="commandes-\d{4}-\d{2}-\d{2}-lot-\d+\.csv"$/
      );
      const exportBatchId = Number(
        normalExportResponse.headers.get("x-export-batch")
      );
      assert.ok(Number.isSafeInteger(exportBatchId) && exportBatchId > 0);
      const batch = await db.execute({
        sql: "SELECT order_count, confirmed_at FROM export_batches WHERE id = ?",
        args: [exportBatchId],
      });
      assert.equal(Number(batch.rows[0].order_count), 2);
      assert.equal(batch.rows[0].confirmed_at, null);

      const batchDownloadResponse = await fetchTest(
        `${baseUrl}/api/admin/export?batch=${exportBatchId}`,
        { headers: { Authorization: adminAuthorization } }
      );
      assert.equal(batchDownloadResponse.status, 200);
      assert.equal(await batchDownloadResponse.text(), normalCsv);
      assert.equal(
        batchDownloadResponse.headers.get("x-export-batch"),
        String(exportBatchId)
      );

      const confirmResponse = await fetchTest(
        `${baseUrl}/api/admin/export/confirm`,
        {
          method: "POST",
          headers: {
            Authorization: adminAuthorization,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ batchId: exportBatchId }),
        }
      );
      assert.equal(confirmResponse.status, 200);
      assert.deepEqual(await confirmResponse.json(), { ok: true, confirmed: 2 });
      const confirmedBatch = await db.execute({
        sql: "SELECT confirmed_at FROM export_batches WHERE id = ?",
        args: [exportBatchId],
      });
      assert.ok(confirmedBatch.rows[0].confirmed_at);
      const confirmedOrders = await db.execute({
        sql: "SELECT COUNT(*) AS count FROM orders WHERE export_batch_id = ? AND import_confirmed_at IS NOT NULL",
        args: [exportBatchId],
      });
      assert.equal(Number(confirmedOrders.rows[0].count), 2);
      assert.equal(
        normalExportResponse.headers.get("cache-control"),
        "no-store, no-cache, must-revalidate, proxy-revalidate"
      );
      assert.equal(normalExportResponse.headers.get("pragma"), "no-cache");
      assert.equal(normalExportResponse.headers.get("expires"), "0");

      const emptyExportResponse = await fetchTest(`${baseUrl}/api/admin/export`, {
        headers: { Authorization: adminAuthorization },
      });
      assert.equal(emptyExportResponse.status, 200);
      assert.equal((await emptyExportResponse.text()).split("\r\n").length, 1);
      assert.equal(emptyExportResponse.headers.get("x-export-batch"), null);

      for (const id of [Number(exportNormal.lastInsertRowid), Number(exportNew.lastInsertRowid)]) {
        assert.ok(
          (
            await db.execute({
              sql: "SELECT exported_at FROM orders WHERE id = ?",
              args: [id],
            })
          ).rows[0].exported_at
        );
      }
      for (const id of [
        Number(pendingExport.lastInsertRowid),
        Number(duplicateExport.lastInsertRowid),
      ]) {
        assert.equal(
          (
            await db.execute({
              sql: "SELECT exported_at FROM orders WHERE id = ?",
              args: [id],
            })
          ).rows[0].exported_at,
          null
        );
      }

      const allBefore = (
        await db.execute(
          "SELECT id, exported_at FROM orders WHERE id IN (?, ?, ?, ?)",
          [
            Number(exportNormal.lastInsertRowid),
            Number(exportNew.lastInsertRowid),
            Number(pendingExport.lastInsertRowid),
            Number(duplicateExport.lastInsertRowid),
          ]
        )
      ).rows;
      const allExportResponse = await fetchTest(`${baseUrl}/api/admin/export?all=1`, {
        headers: { Authorization: adminAuthorization },
      });
      assert.equal(allExportResponse.status, 200);
      const allCsv = await allExportResponse.text();
      assert.equal(allCsv.split("\r\n")[0], expectedHeader);
      assert.doesNotMatch(allCsv, /Synthetic pending|Synthetic duplicate/);
      assert.match(allExportResponse.headers.get("content-disposition"), /^attachment;/);
      const allAfter = (
        await db.execute(
          "SELECT id, exported_at FROM orders WHERE id IN (?, ?, ?, ?)",
          [
            Number(exportNormal.lastInsertRowid),
            Number(exportNew.lastInsertRowid),
            Number(pendingExport.lastInsertRowid),
            Number(duplicateExport.lastInsertRowid),
          ]
        )
      ).rows;
      assert.deepEqual(
        allAfter.map((row) => [Number(row.id), row.exported_at]),
        allBefore.map((row) => [Number(row.id), row.exported_at])
      );
      t.diagnostic("Both Navex export modes passed contract and eligibility checks.");

      let cleanupPhoneCounter = 0;
      const insertCleanupOrder = async (
        status,
        duplicateOf = null,
        withHistory = false,
        name = "Synthetic cleanup",
        importConfirmed = true,
        exported = true
      ) => {
        cleanupPhoneCounter += 1;
        const inserted = await db.execute({
          sql: `INSERT INTO orders (
            name, address, city, governorate, phone, phone2, product_id,
            designation, qty, item_price, delivery_fee, total, exported_at,
            import_confirmed_at,
            duplicate_status, duplicate_of
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            CASE WHEN ? = 1 THEN datetime('now', '-31 days') ELSE NULL END,
            CASE WHEN ? = 1 THEN datetime('now', '-31 days') ELSE NULL END, ?, ?)`,
          args: [
            name,
            "Synthetic address",
            "ARIANA VILLE",
            "Ariana",
            `270000${String(cleanupPhoneCounter).padStart(2, "0")}`,
            `270000${String(cleanupPhoneCounter).padStart(2, "0")}`,
            "synthetic-shirt",
            "Synthetic Shirt",
            1,
            30,
            8,
            38,
            exported ? 1 : 0,
            importConfirmed ? 1 : 0,
            status,
            duplicateOf,
          ],
        });
        const id = Number(inserted.lastInsertRowid);
        await db.execute({
          sql: `INSERT INTO order_items (
            order_id, product_id, product_name, color, size, qty, unit_price, line_total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [id, "synthetic-shirt", "Synthetic Shirt", "Black", "M", 1, 30, 30],
        });
        if (withHistory) {
          await db.execute({
            sql: `INSERT INTO order_review_history (
              order_id, previous_status, new_status, reviewed_by
            ) VALUES (?, 'normal', 'confirmed_new', 'admin')`,
            args: [id],
          });
        }
        return id;
      };

      const cleanupPending = await insertCleanupOrder(
        "pending_review",
        null,
        false,
        "Synthetic protected pending"
      );
      const cleanupDuplicate = await insertCleanupOrder(
        "confirmed_duplicate",
        null,
        false,
        "Synthetic protected duplicate"
      );
      const cleanupReferenced = await insertCleanupOrder(
        "normal",
        null,
        false,
        "Synthetic referenced target"
      );
      const cleanupReference = await insertCleanupOrder(
        "confirmed_duplicate",
        cleanupReferenced,
        false,
        "Synthetic referencing duplicate"
      );
      const cleanupInHistory = await insertCleanupOrder(
        "normal",
        null,
        true,
        "Synthetic protected history"
      );
      const cleanupEligible = await insertCleanupOrder(
        "normal",
        null,
        false,
        "Synthetic eligible cleanup"
      );
      const cleanupUnconfirmed = await insertCleanupOrder(
        "normal",
        null,
        false,
        "Synthetic unconfirmed export",
        false
      );
      const cleanupConfirmedWithoutExportMarker = await insertCleanupOrder(
        "normal",
        null,
        false,
        "Synthetic confirmed import without export marker",
        true,
        false
      );
      const backupResponse = await fetchTest(
        `${baseUrl}/api/admin/orders/cleanup-backup`,
        { headers: { Authorization: adminAuthorization } }
      );
      t.diagnostic(`Admin cleanup backup returned ${backupResponse.status}.`);
      assert.equal(backupResponse.status, 200);
      const backupCsv = await backupResponse.text();
      assert.match(backupCsv, /Synthetic eligible cleanup/);
      assert.match(backupCsv, /Synthetic confirmed import without export marker/);
      assert.doesNotMatch(
        backupCsv,
        /Synthetic protected pending|Synthetic protected duplicate|Synthetic referenced target|Synthetic protected history|Synthetic unconfirmed export/
      );
      const publicBackupResponse = await fetchTest(
        `${baseUrl}/api/orders/cleanup-backup`,
        { headers: { Authorization: adminAuthorization } }
      );
      t.diagnostic(`Public cleanup backup returned ${publicBackupResponse.status}.`);
      assert.equal(publicBackupResponse.status, 200);
      assert.equal(await publicBackupResponse.text(), backupCsv);

      const cleanupResponse = await fetchTest(
        `${baseUrl}/api/admin/orders/cleanup`,
        { method: "POST", headers: { Authorization: adminAuthorization } }
      );
      t.diagnostic(`Admin cleanup returned ${cleanupResponse.status}.`);
      assert.equal(cleanupResponse.status, 200);
      assert.equal((await cleanupResponse.json()).deleted, 2);
      for (const id of [
        cleanupPending,
        cleanupDuplicate,
        cleanupReferenced,
        cleanupReference,
        cleanupInHistory,
        cleanupUnconfirmed,
      ]) {
        assert.ok(
          (
            await db.execute({
              sql: "SELECT id FROM orders WHERE id = ?",
              args: [id],
            })
          ).rows.length
        );
      }
      assert.equal(
        (
          await db.execute({
            sql: "SELECT COUNT(*) AS n FROM order_items WHERE order_id = ?",
            args: [cleanupEligible],
          })
        ).rows[0].n,
        0
      );
      assert.equal(
        (
          await db.execute({
            sql: "SELECT id FROM orders WHERE id = ?",
            args: [cleanupEligible],
          })
        ).rows.length,
        0
      );
      assert.equal(
        (
          await db.execute({
            sql: "SELECT id FROM orders WHERE id = ?",
            args: [cleanupConfirmedWithoutExportMarker],
          })
        ).rows.length,
        0
      );
      const cleanupEligiblePublic = await insertCleanupOrder(
        "normal",
        null,
        false,
        "Synthetic eligible public cleanup"
      );
      const publicCleanupResponse = await fetchTest(
        `${baseUrl}/api/orders/cleanup`,
        {
          method: "POST",
          headers: { Authorization: adminAuthorization },
        }
      );
      t.diagnostic(`Public cleanup returned ${publicCleanupResponse.status}.`);
      assert.equal(publicCleanupResponse.status, 200);
      assert.equal((await publicCleanupResponse.json()).deleted, 1);
      assert.equal(
        (
          await db.execute({
            sql: "SELECT COUNT(*) AS n FROM order_items WHERE order_id = ?",
            args: [cleanupEligiblePublic],
          })
        ).rows[0].n,
        0
      );
      assert.equal(
        (
          await db.execute({
            sql: "SELECT id FROM orders WHERE id = ?",
            args: [cleanupEligiblePublic],
          })
        ).rows.length,
        0
      );
      assert.equal(
        (
          await db.execute({
            sql: "SELECT COUNT(*) AS n FROM order_items WHERE order_id = ?",
            args: [cleanupPending],
          })
        ).rows[0].n,
        1
      );
      t.diagnostic("Both cleanup routes preserved protected orders and removed only eligible rows.");
    } finally {
      if (serverProcess) await stopServer(serverProcess);
      await db.close();
      process.chdir(originalCwd);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          await rm(tempRoot, { recursive: true, force: true });
          break;
        } catch (error) {
          if (attempt === 9) {
            t.diagnostic(`Could not remove isolated test directory: ${error.message}`);
          } else {
            await new Promise((resolveWait) => setTimeout(resolveWait, 300));
          }
        }
      }
    }
  }
);
