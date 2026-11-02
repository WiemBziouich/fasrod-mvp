import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextCli = resolve(projectRoot, "node_modules", "next", "dist", "bin", "next");
const migrationScript = resolve(
  projectRoot,
  "scripts",
  "migrate-product-sort-order.mjs"
);
const authorization = `Basic ${Buffer.from("admin:product-order-test").toString("base64")}`;

function testEnvironment() {
  return Object.fromEntries(
    Object.entries({
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      TURSO_DATABASE_URL: "file:data/orders.db",
      TURSO_AUTH_TOKEN: "",
      ADMIN_PASSWORD: "product-order-test",
      NEXT_TELEMETRY_DISABLED: "1",
    }).filter(([, value]) => value !== undefined)
  );
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

async function startServer(output) {
  const port = await unusedPort();
  const child = spawn(
    process.execPath,
    [nextCli, "dev", projectRoot, "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: testEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );
  child.stdout
    .setEncoding("utf8")
    .on("data", (chunk) => {
      output.value = `${output.value}${chunk}`.slice(-8000);
    });
  child.stderr
    .setEncoding("utf8")
    .on("data", (chunk) => {
      output.value = `${output.value}${chunk}`.slice(-8000);
    });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Next.js test server exited early (${child.exitCode}): ${output.value}`
      );
    }
    try {
      const response = await fetch(`${baseUrl}/api/products`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) return { child, baseUrl };
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  throw new Error(`Next.js test server did not start: ${output.value}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  const closed = new Promise((resolveClose) => child.once("close", resolveClose));
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 10_000);
  await closed;
  clearTimeout(timeout);
}

test(
  "product ordering migration, creation, fallback, and reorder validation use temporary SQLite",
  { timeout: 120_000 },
  async (t) => {
    const originalCwd = process.cwd();
    const tempRoot = await mkdtemp(resolve(tmpdir(), "fasrod-product-order-"));
    await mkdir(resolve(tempRoot, "data"), { recursive: true });
    process.chdir(tempRoot);
    let db = createClient({ url: "file:data/orders.db" });
    let server;
    const output = { value: "" };

    try {
      await db.execute(`
        CREATE TABLE products (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          price INTEGER NOT NULL,
          desc_fr TEXT NOT NULL,
          desc_ar TEXT NOT NULL,
          images TEXT NOT NULL,
          colors TEXT NOT NULL,
          sizes TEXT NOT NULL,
          active INTEGER NOT NULL
        )
      `);
      for (const [id, name] of [
        ["product-first", "Premier produit"],
        ["product-second", "Deuxième produit"],
      ]) {
        await db.execute({
          sql: `INSERT INTO products
            (id, name, category, price, desc_fr, desc_ar, images, colors, sizes, active)
            VALUES (?, ?, 'Test', 10, 'Description', 'وصف', '[]', '[]', '[]', 1)`,
          args: [id, name],
        });
      }

      server = await startServer(output);
      const legacyListResponse = await fetch(`${server.baseUrl}/api/products`);
      assert.equal(legacyListResponse.status, 200);
      assert.deepEqual(
        (await legacyListResponse.json()).map((product) => product.id),
        ["product-first", "product-second"]
      );

      const product = {
        id: "product-new",
        name: "Produit récent",
        category: "Test",
        price: 20,
        descFr: "Description",
        descAr: "وصف",
        images: ["/products/test.png"],
        colors: [{ name: "Noir", hex: "#000000", images: ["/products/test.png"] }],
        sizes: ["M"],
        active: true,
      };
      const headers = {
        "Content-Type": "application/json",
        Authorization: authorization,
      };
      const createBeforeMigration = await fetch(
        `${server.baseUrl}/api/admin/products`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(product),
        }
      );
      assert.equal(createBeforeMigration.status, 503);
      assert.equal(
        (await createBeforeMigration.json()).error,
        "product_sort_order_migration_required"
      );

      const reorderBeforeMigration = await fetch(
        `${server.baseUrl}/api/admin/products/reorder`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({ ids: ["product-first", "product-second"] }),
        }
      );
      assert.equal(reorderBeforeMigration.status, 503);

      await stopServer(server.child);
      server = undefined;
      await db.close();
      db = null;
      const migrationEnvironment = {
        ...testEnvironment(),
        TURSO_DATABASE_URL: "file:data/orders.db",
      };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const migration = spawnSync(process.execPath, [migrationScript], {
          cwd: tempRoot,
          env: migrationEnvironment,
          encoding: "utf8",
        });
        assert.equal(migration.status, 0, migration.stderr);
      }
      db = createClient({ url: "file:data/orders.db" });
      assert.deepEqual(
        (
          await db.execute("SELECT id, sort_order FROM products ORDER BY sort_order")
        ).rows.map((row) => [String(row.id), Number(row.sort_order)]),
        [
          ["product-first", 10],
          ["product-second", 20],
        ]
      );

      server = await startServer(output);
      const invalidOrders = [
        ["product-first"],
        ["product-first", "product-first"],
        ["product-first", "unknown-product"],
      ];
      for (const ids of invalidOrders) {
        const response = await fetch(
          `${server.baseUrl}/api/admin/products/reorder`,
          {
            method: "PUT",
            headers,
            body: JSON.stringify({ ids }),
          }
        );
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { error: "products_changed" });
      }

      const missingContentType = await fetch(
        `${server.baseUrl}/api/admin/products/reorder`,
        {
          method: "PUT",
          headers: { Authorization: authorization },
          body: JSON.stringify({ ids: ["product-first", "product-second"] }),
        }
      );
      assert.equal(missingContentType.status, 415);

      const reordered = await fetch(
        `${server.baseUrl}/api/admin/products/reorder`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({ ids: ["product-second", "product-first"] }),
        }
      );
      assert.equal(reordered.status, 200);
      assert.deepEqual(
        (await (await fetch(`${server.baseUrl}/api/products`)).json()).map(
          (item) => item.id
        ),
        ["product-second", "product-first"]
      );

      const created = await fetch(`${server.baseUrl}/api/admin/products`, {
        method: "POST",
        headers,
        body: JSON.stringify(product),
      });
      assert.equal(created.status, 201);
      assert.equal(
        Number(
          (
            await db.execute({
              sql: "SELECT sort_order FROM products WHERE id = ?",
              args: [product.id],
            })
          ).rows[0].sort_order
        ),
        0
      );
      assert.deepEqual(
        (await (await fetch(`${server.baseUrl}/api/products`)).json()).map(
          (item) => item.id
        ),
        ["product-new", "product-second", "product-first"]
      );
    } finally {
      if (server) await stopServer(server.child);
      await db?.close();
      process.chdir(originalCwd);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          await rm(tempRoot, { recursive: true, force: true });
          break;
        } catch (error) {
          if (attempt === 9) {
            t.diagnostic(`Could not remove temporary test directory: ${error.message}`);
          } else {
            await new Promise((resolveWait) => setTimeout(resolveWait, 300));
          }
        }
      }
    }
  }
);
