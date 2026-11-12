import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
  decideCustomerReview,
  getParcelReviewSignals,
  isOpenParcelRisk,
} from "../lib/customer-risk.mjs";
import { extractImportedPhones } from "../lib/phone-import.mjs";
import {
  findUniqueRecentExport,
  maskNavexPhone,
  parseNavexPaste,
} from "../lib/navex-paste.mjs";
import { getStatesWithFetch } from "../lib/navex/client-core.mjs";
import { PAGE_STATES } from "../lib/navex/page-states.mjs";
import { mapEtat } from "../lib/navex/state-map-core.mjs";
import { FakeNavexClient } from "../lib/navex/fake-client.mjs";
import { refreshParcelStatesWithDb } from "../lib/navex-sync-core.mjs";
import {
  createOrderColumnCache,
  createReviewReasonColumnCache,
} from "../lib/review-reason-column.mjs";
import { runStateDiscovery } from "../scripts/navex-discover-states.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = resolve(root, "scripts", "migrate-customer-memory.mjs");

async function removeTemporaryDirectory(directory, t) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 9) {
        t.diagnostic(`Could not remove isolated test directory: ${error.message}`);
      } else {
        await new Promise((resolveWait) => setTimeout(resolveWait, 300));
      }
    }
  }
}

test("customer risk rules B, C and D each trigger review", () => {
  assert.equal(decideCustomerReview({ recentExport: true }).reason, "open_parcel");
  assert.equal(decideCustomerReview({ openParcel: true }).reason, "open_parcel");
  assert.equal(decideCustomerReview({ recentReturn: true }).reason, "previous_return");
  assert.equal(decideCustomerReview({ flaggedPhone: true }).reason, "flagged_phone");
});

test("review reasons accumulate in configured priority order", () => {
  const decision = decideCustomerReview({
    sameBasket: true,
    recentPhone: true,
    recentExport: true,
    openParcel: true,
    recentReturn: true,
    flaggedPhone: true,
  });
  assert.deepEqual(decision.reasons, [
    "same_basket",
    "recent_phone",
    "flagged_phone",
    "previous_return",
    "open_parcel",
  ]);
  assert.equal(
    decision.reason,
    "same_basket, recent_phone, flagged_phone, previous_return, open_parcel"
  );
  assert.equal(decision.duplicateStatus, "pending_review");
});

test("ignored motif regex is safe to reuse without stateful flags", () => {
  const ignoredMotif = /disponible demain/i;
  const parcel = {
    state: "in_transit",
    motif: "Disponible demain",
    date: new Date().toISOString(),
  };
  const options = {
    openStates: ["in_transit"],
    ignoredMotif,
    days: 21,
  };
  assert.equal(isOpenParcelRisk(parcel, options), false);
  assert.equal(isOpenParcelRisk(parcel, options), false);
});

test("identical basket remains the highest-priority review reason", () => {
  assert.deepEqual(
    decideCustomerReview({
      sameBasket: true,
      recentPhone: true,
      recentExport: true,
      openParcel: true,
      recentReturn: true,
      flaggedPhone: true,
    }),
    {
      reasons: [
        "same_basket",
        "recent_phone",
        "flagged_phone",
        "previous_return",
        "open_parcel",
      ],
      reason:
        "same_basket, recent_phone, flagged_phone, previous_return, open_parcel",
      duplicateStatus: "pending_review",
    }
  );
});

test("open parcel with motif disponible demain is ignored", () => {
  assert.equal(
    isOpenParcelRisk(
      {
        state: "in_transit",
        motif: "Disponible demain",
        date: new Date().toISOString(),
      },
      {
        openStates: ["in_transit"],
        ignoredMotif: /disponible demain/i,
        days: 21,
      }
    ),
    false
  );
});

test("customer risk signals derive from normalized parcel states", () => {
  const signals = getParcelReviewSignals(
    [
      { state: "in_transit", motif: "", date: new Date().toISOString() },
      { state: "returned", motif: "", date: new Date().toISOString() },
      { state: "unserious", motif: "", date: new Date().toISOString() },
      {
        state: "returned",
        motif: "Client disponible demain",
        date: new Date().toISOString(),
      },
      { state: "delivered", motif: "", date: new Date().toISOString() },
    ],
    {
      openStates: ["pending", "depot", "in_transit", "to_verify", "exchange"],
      ignoredMotif: /disponible demain/i,
      openDays: 21,
      returnDays: 90,
    }
  );
  assert.equal(signals.openParcels.length, 1);
  assert.equal(signals.recentReturns.length, 2);
  assert.equal(
    decideCustomerReview({
      recentReturn: signals.recentReturns.some(
        (parcel) => parcel.motif === "Client disponible demain"
      ),
    }).reason,
    ""
  );
  for (const [label, expected] of [
    ["En attente", "pending"],
    ["À enlever", "pending"],
    ["Enlevé", "pending"],
    ["Enlevés", "pending"],
    ["Enlevée", "pending"],
    ["RTN dépôt", "returned"],
    ["À vérifier", "to_verify"],
    ["Livrés", "delivered"],
    ["En cours", "in_transit"],
    ["Au dépôt", "depot"],
    ["Retour définitif", "returned"],
    ["Retour Inter-agence", "returned"],
    ["Retour reçu", "returned"],
    ["Retour Expéditeurs", "returned"],
    ["Échanges", "exchange"],
    ["Livrés payés", "delivered"],
    ["Non sérieux", "unserious"],
    ["Client non sérieux", "unserious"],
    ["Client pas sérieux", "unserious"],
  ]) {
    assert.ok(PAGE_STATES.includes(label));
    assert.equal(mapEtat(label), expected);
  }
  assert.equal(mapEtat("Livrer Paye"), "delivered");
  assert.equal(mapEtat("Livré(s)"), "delivered");
  assert.equal(mapEtat(" Retour définitif "), "returned");
  assert.equal(mapEtat("en  attente"), "pending");
  assert.equal(mapEtat("État inédit"), "other");
});

test("review-reason column cache retries failures and expires after sixty seconds", async () => {
  let timestamp = 1_000;
  let calls = 0;
  const values = [new Error("pragma failed"), true, false];
  const hasColumn = createReviewReasonColumnCache(async () => {
    calls += 1;
    const value = values.shift();
    if (value instanceof Error) throw value;
    return value;
  }, { now: () => timestamp });

  assert.equal(await hasColumn(), false);
  assert.equal(calls, 1);
  assert.equal(await hasColumn(), true);
  assert.equal(calls, 2);
  timestamp += 59_999;
  assert.equal(await hasColumn(), true);
  assert.equal(calls, 2);
  timestamp += 1;
  assert.equal(await hasColumn(), false);
  assert.equal(calls, 3);
});

test("order column cache shares one schema read across column checks", async () => {
  let calls = 0;
  const hasColumn = createOrderColumnCache(async () => {
    calls += 1;
    return ["review_reason", "review_decision"];
  });

  assert.deepEqual(
    await Promise.all([
      hasColumn("review_reason"),
      hasColumn("review_decision"),
      hasColumn("missing"),
    ]),
    [true, true, false]
  );
  assert.equal(calls, 1);
});

test("collage parser extracts parcel dates and phones while masking the preview", () => {
  const parsed = parseNavexPaste(
    "Colis 123456789012 Prix 45.50 Date 2026-11-11 21234567 29876543\n" +
      "Colis 987654321098 Prix 16 Date 2026-11-10 sans téléphone",
    "À vérifier"
  );
  assert.deepEqual(parsed, {
    parcels: [{
      code: "123456789012",
      phone: "21234567",
      phone2: "29876543",
      state: "to_verify",
      stateRaw: "À vérifier",
      motif: "",
      parcelDate: "2026-11-11",
    }],
    ignoredCount: 1,
  });
  assert.equal(maskNavexPhone(parsed.parcels[0].phone), "2••••567");
  const returnedWithIgnoredMotif = parseNavexPaste(
    "123123123123 21234567 rtn CLIENT DISPONIBLE demain",
    "RTN dépôt"
  );
  assert.equal(returnedWithIgnoredMotif.parcels[0].motif, "Client disponible demain");
  const returnSignals = getParcelReviewSignals(returnedWithIgnoredMotif.parcels.map((parcel) => ({
    state: parcel.state,
    motif: parcel.motif,
    date: new Date().toISOString(),
  })), {
    openStates: [],
    ignoredMotif: /disponible demain/i,
    openDays: 21,
    returnDays: 90,
  });
  assert.equal(
    decideCustomerReview({ recentReturn: returnSignals.recentReturns.length > 0 }).reason,
    ""
  );
  assert.deepEqual(
    extractImportedPhones("Colis 123456789012, téléphone 21234567, 21234567; 98765432"),
    ["21234567", "98765432"]
  );
});

test("collage preview can identify more than one thousand parcel codes", () => {
  const text = Array.from(
    { length: 1001 },
    (_, index) => String(700000000000 + index)
  ).join("\n");
  const preview = parseNavexPaste(text, "En attente");
  assert.equal(preview.parcels.length, 0);
  assert.equal(preview.ignoredCount, 1001);
});

test("ambiguous recent exports do not attach a parcel order id", () => {
  const recentOrders = [
    { id: 8, phone: "21234567", phone2: "21234567" },
    { id: 9, phone: "21234567", phone2: "29876543" },
  ];
  assert.equal(findUniqueRecentExport("21234567", "", recentOrders), null);
  assert.equal(findUniqueRecentExport("29876543", "", recentOrders), 9);
  assert.equal(findUniqueRecentExport("21111111", "", recentOrders), null);
});

function apiResult(code, overrides = {}) {
  return {
    status: 1,
    code,
    etat: "En attente",
    status_message: "ok",
    motif: null,
    pre_etat: null,
    pre_motif: null,
    ...overrides,
  };
}

test("Navex fetch uses the POST form contract and returns status 0 safely", async () => {
  let request;
  const results = await getStatesWithFetch(
    ["123456789012", "234567890123"],
    "synthetic-token",
    async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({
        status: 1,
        total: 2,
        results: [
          apiResult("123456789012"),
          {
            status: 0,
            code: "234567890123",
            etat: "",
            status_message: "not found",
          },
        ],
      }), { status: 200 });
    }
  );
  assert.match(request.url, /^https:\/\/app\.navex\.tn\/api\/synthetic-token\/v1\/post\.php$/);
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(
    request.init.body,
    "codes=123456789012%2C%20234567890123"
  );
  assert.equal(results[1].status, 0);
  assert.equal("motif" in results[1], false);
  assert.equal("status_message" in results[1], true);
});

test("Navex response accepts documented found, not-found, mixed, and omitted codes", async () => {
  const requestedCodes = [
    "123456789012",
    "234567890123",
    "345678901234",
  ];
  const results = await getStatesWithFetch(
    requestedCodes,
    "synthetic-token",
    async () => new Response(JSON.stringify({
      status: 1,
      total: 3,
      results: [
        {
          status: 1,
          code: "123456789012",
          etat: "En cours",
          status_message: "found",
        },
        {
          status: 0,
          code: "234567890123",
          etat: "",
          status_message: "not found",
        },
        {
          status: "invalid",
          code: "999999999999",
        },
      ],
    }), { status: 200 })
  );
  assert.deepEqual(results, [
    {
      status: 1,
      code: "123456789012",
      etat: "En cours",
      status_message: "found",
      motif: null,
      pre_etat: null,
      pre_motif: null,
    },
    {
      status: 0,
      code: "234567890123",
      etat: "",
      status_message: "not found",
    },
  ]);
});

test("Navex requests use sequential batches of at most twenty codes", async () => {
  const batches = [];
  let activeRequests = 0;
  let overlappedRequests = false;
  const codes = Array.from({ length: 41 }, (_, index) =>
    String(index + 1).padStart(12, "0")
  );
  await getStatesWithFetch(codes, "synthetic-token", async (_url, init) => {
    activeRequests += 1;
    if (activeRequests > 1) overlappedRequests = true;
    const body = new URLSearchParams(init.body);
    const batch = body.get("codes").split(", ");
    batches.push(batch);
    await Promise.resolve();
    activeRequests -= 1;
    return new Response(JSON.stringify({
      status: 1,
      total: batch.length,
      results: batch.map((code) => apiResult(code)),
    }), { status: 200 });
  });
  assert.deepEqual(batches.map((batch) => batch.length), [20, 20, 1]);
  assert.equal(overlappedRequests, false);
});

test("Navex auth errors do not retry and never leak the token", async () => {
  for (const status of [401, 403]) {
    let calls = 0;
    await assert.rejects(
      getStatesWithFetch(["123456789012"], "private-synthetic-token", async () => {
        calls += 1;
        return new Response("", { status });
      }),
      (error) => {
        assert.equal(error.message, "navex_auth");
        assert.equal(error.message.includes("private-synthetic-token"), false);
        return true;
      }
    );
    assert.equal(calls, 1);
  }
});

test("Navex network failure retries once and never exposes thrown text", async () => {
  let calls = 0;
  const originalError = console.error;
  const consoleOutput = [];
  console.error = (...values) => consoleOutput.push(values.join(" "));
  try {
    await getStatesWithFetch(
      ["123456789012"],
      "private-token-value",
      async (_url, init) => {
        calls += 1;
        if (calls === 1) throw new Error("failed private-token-value https://secret.invalid");
        const code = new URLSearchParams(init.body).get("codes");
        return new Response(JSON.stringify({
          status: 1,
          total: 1,
          results: [apiResult(code)],
        }), { status: 200 });
      }
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(calls, 2);
  assert.doesNotMatch(consoleOutput.join("\n"), /private-token-value|secret\.invalid/);
});

test("Navex client retries 5xx once, times out, and rejects malformed payloads", async () => {
  let retryCount = 0;
  await getStatesWithFetch(["123456789012"], "token", async (_url, init) => {
    retryCount += 1;
    if (retryCount === 1) return new Response("", { status: 503 });
    const code = new URLSearchParams(init.body).get("codes");
    return new Response(JSON.stringify({
      status: 1,
      total: 1,
      results: [apiResult(code)],
    }), { status: 200 });
  });
  assert.equal(retryCount, 2);

  await assert.rejects(
    getStatesWithFetch(["123456789012"], "token", async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 1,
        total: 1,
        results: [{ status: 1, code: "123456789012" }],
      }),
    })),
    { message: "navex_bad_response" }
  );
  await assert.rejects(
    getStatesWithFetch(
      ["123456789012"],
      "token",
      (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("network")));
      }),
      10
    ),
    { message: "navex_timeout" }
  );
});

test("discovery summary never prints codes, courier data, or token values", async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), "fasrod-discover-"));
  const codesPath = resolve(directory, "codes.txt");
  const fs = await import("node:fs/promises");
  await fs.writeFile(codesPath, "123456789012\n234567890123\n", "utf8");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = [];
  await runStateDiscovery({
    filePath: codesPath,
    token: "secret-discovery-token",
    target: "https://app.navex.tn",
    client: new FakeNavexClient([
      apiResult("123456789012", { etat: "Livré(s)", livreur: "Private courier" }),
      {
        ...apiResult("234567890123"),
        status: 0,
      },
    ]),
    output: (line) => output.push(line),
  });
  const joined = output.join("\n");
  assert.match(joined, /Traités : 2/);
  assert.match(joined, /Introuvables : 1/);
  assert.match(joined, /Livré\(s\)/);
  assert.doesNotMatch(joined, /123456789012|234567890123|Private courier|secret-discovery-token/);
  await assert.rejects(
    runStateDiscovery({
      filePath: codesPath,
      token: "token",
      target: "https://wrong.example",
      client: new FakeNavexClient([]),
      output: () => {},
    }),
    { message: "navex_bad_response" }
  );
  await assert.rejects(
    runStateDiscovery({
      filePath: codesPath,
      token: "",
      client: new FakeNavexClient([]),
      output: () => {},
    }),
    { message: "navex_not_configured" }
  );
  const tooManyPath = resolve(directory, "too-many.txt");
  await fs.writeFile(
    tooManyPath,
    Array.from({ length: 101 }, (_, index) =>
      String(index).padStart(12, "0")
    ).join("\n"),
    "utf8"
  );
  await assert.rejects(
    runStateDiscovery({
      filePath: tooManyPath,
      token: "token",
      client: new FakeNavexClient([]),
      output: () => {},
    }),
    { message: "navex_bad_response" }
  );
});

test("customer-memory migration is repeatable and parcel schema stores no name or address", async (t) => {
  const cwd = process.cwd();
  const temp = await mkdtemp(resolve(tmpdir(), "fasrod-customer-memory-"));
  await mkdir(resolve(temp, "data"));
  process.chdir(temp);
  const db = createClient({ url: "file:data/orders.db" });
  t.after(async () => {
    await db.close();
    process.chdir(cwd);
    await removeTemporaryDirectory(temp, t);
  });

  await db.execute(`CREATE TABLE orders (
    id INTEGER PRIMARY KEY, created_at TEXT, phone TEXT, phone2 TEXT
  )`);
  await db.execute(`CREATE TABLE order_review_history (
    id INTEGER PRIMARY KEY, order_id INTEGER, previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL, reviewed_by TEXT NOT NULL DEFAULT 'admin'
  )`);
  await db.execute(`CREATE TABLE navex_parcels (
    code TEXT PRIMARY KEY, phone TEXT NOT NULL, phone2 TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL, state_raw TEXT NOT NULL DEFAULT '', motif TEXT NOT NULL DEFAULT '',
    price INTEGER, parcel_date TEXT, order_id INTEGER, updated_at TEXT NOT NULL
  )`);
  await db.execute({
    sql: `INSERT INTO navex_parcels
      (code, phone, state, parcel_date, updated_at)
      VALUES ('123456789012', '21234567', 'pending', '2026-09-15', '2026-10-01 09:00:00')`,
  });
  await db.execute({
    sql: `INSERT INTO navex_parcels
      (code, phone, state, parcel_date, updated_at)
      VALUES ('234567890123', '21234567', 'pending', NULL, '2025-01-01 09:00:00')`,
  });
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    TURSO_DATABASE_URL: "file:data/orders.db",
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = spawnSync(process.execPath, [migration], {
      cwd: temp,
      env,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  }
  const parcelColumns = await db.execute("PRAGMA table_info(navex_parcels)");
  const names = parcelColumns.rows.map((row) => String(row.name));
  assert.equal(names.includes("name"), false);
  assert.equal(names.includes("address"), false);
  const firstSeen = parcelColumns.rows.find(
    (row) => String(row.name) === "first_seen_at"
  );
  assert.equal(Number(firstSeen.notnull), 1);
  assert.match(String(firstSeen.dflt_value), /datetime\('now'\)/i);
  const stateChanged = parcelColumns.rows.find(
    (row) => String(row.name) === "state_changed_at"
  );
  assert.equal(Number(stateChanged.notnull), 1);
  assert.match(String(stateChanged.dflt_value), /datetime\('now'\)/i);
  const parcelSchema = await db.execute(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'navex_parcels'"
  );
  assert.match(String(parcelSchema.rows[0].sql), /'unserious'/);
  await db.execute({
    sql: `INSERT INTO navex_parcels
      (code, phone, state) VALUES ('345678901234', '21234567', 'unserious')`,
  });
  const migratedParcel = await db.execute(
    "SELECT code, first_seen_at FROM navex_parcels ORDER BY code"
  );
  assert.equal(migratedParcel.rows[0].first_seen_at, "2026-09-15");
  const migrationDate = await db.execute(
    "SELECT date(first_seen_at) AS first_seen_date FROM navex_parcels WHERE code = '234567890123'"
  );
  assert.equal(
    migrationDate.rows[0].first_seen_date,
    new Date().toISOString().slice(0, 10)
  );
  const reviewColumn = await db.execute("PRAGMA table_info(orders)");
  assert.ok(reviewColumn.rows.some((row) => String(row.name) === "review_reason"));
  assert.ok(reviewColumn.rows.some((row) => String(row.name) === "review_decision"));
  const reviewHistoryColumns = await db.execute(
    "PRAGMA table_info(order_review_history)"
  );
  assert.ok(
    reviewHistoryColumns.rows.some((row) => String(row.name) === "review_action")
  );

  const rejected = spawnSync(process.execPath, [migration], {
    cwd: temp,
    env: { ...env, TURSO_DATABASE_URL: "libsql://invalid.invalid" },
    encoding: "utf8",
  });
  assert.notEqual(rejected.status, 0);
});

test("Navex state refresh updates parcels using the fake client in SQLite", async (t) => {
  const db = createClient({ url: "file::memory:" });
  t.after(async () => db.close());
  await db.execute(`CREATE TABLE orders (
    id INTEGER PRIMARY KEY, phone TEXT, phone2 TEXT, total INTEGER, created_at TEXT
  )`);
  await db.execute(`CREATE TABLE navex_parcels (
    code TEXT PRIMARY KEY, phone TEXT NOT NULL, phone2 TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL, state_raw TEXT NOT NULL DEFAULT '', motif TEXT NOT NULL DEFAULT '',
    parcel_date TEXT, order_id INTEGER, first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    state_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await db.execute(`CREATE TABLE navex_sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1), last_sync_at TEXT, last_status TEXT,
    last_count INTEGER, last_error TEXT
  )`);
  await db.execute({
    sql: "INSERT INTO orders (id, phone, phone2, total, created_at) VALUES (1, ?, ?, 38, ?)",
    args: ["21234567", "21234567", "2026-11-10 12:00:00"],
  });
  const initial = {
    code: "123456789012",
    status: 1,
    etat: "En attente",
    motif: null,
    pre_etat: null,
    pre_motif: null,
  };
  await db.execute({
    sql: `INSERT INTO navex_parcels
      (code, phone, phone2, state, state_raw, motif, parcel_date, first_seen_at,
       state_changed_at, updated_at)
      VALUES (?, ?, '', 'pending', 'En attente', '', ?, '2026-10-01', '2026-10-01', datetime('now', '-10 days'))`,
    args: ["123456789012", "21234567", new Date().toISOString()],
  });
  await db.execute({
    sql: `INSERT INTO navex_parcels
      (code, phone, state, state_raw, motif, parcel_date, state_changed_at)
      VALUES ('234567890123', '21234567', 'in_transit', 'En cours', 'motif conservé', ?, '2020-01-01')`,
    args: [new Date().toISOString()],
  });
  await db.execute({
    sql: `INSERT INTO navex_parcels
      (code, phone, state, state_raw, parcel_date, state_changed_at, updated_at)
      VALUES ('345678901234', '21234567', 'pending', 'En attente', ?, '2020-02-01', '2020-02-01')`,
    args: [new Date().toISOString()],
  });
  const refreshed = await refreshParcelStatesWithDb(
    new FakeNavexClient([
      { ...initial, etat: "Livré(s)" },
      {
        status: 0,
        code: "234567890123",
        etat: "",
        status_message: "not found",
      },
      { ...initial, code: "345678901234" },
    ]),
    db
  );
  assert.deepEqual(refreshed, { processed: 3, updated: 2, notFound: 1 });
  const rows = await db.execute(
    "SELECT code, state, motif, order_id, first_seen_at, state_changed_at FROM navex_parcels ORDER BY code"
  );
  assert.equal(rows.rows.length, 3);
  assert.equal(rows.rows[0].state, "delivered");
  assert.equal(rows.rows[0].order_id, null);
  assert.equal(rows.rows[0].first_seen_at, "2026-10-01");
  assert.equal(rows.rows[1].state, "in_transit");
  assert.equal(rows.rows[1].motif, "motif conservé");
  assert.equal(rows.rows[1].state_changed_at, "2020-01-01");
  assert.equal(rows.rows[2].state, "pending");
  assert.equal(rows.rows[2].state_changed_at, "2020-02-01");
  const changedAt = await db.execute(
    "SELECT datetime(state_changed_at) >= datetime('now', '-1 minute') AS recent FROM navex_parcels WHERE code = '123456789012'"
  );
  assert.equal(Number(changedAt.rows[0].recent), 1);
  const updatedAt = await db.execute(
    "SELECT datetime(updated_at) >= datetime('now', '-1 minute') AS recent FROM navex_parcels WHERE code = '345678901234'"
  );
  assert.equal(Number(updatedAt.rows[0].recent), 1);
  const syncState = await db.execute("SELECT last_status, last_count FROM navex_sync_state WHERE id = 1");
  assert.equal(syncState.rows[0].last_status, "success");
  assert.equal(Number(syncState.rows[0].last_count), 2);
});

test("state refresh caps at 100 and applies state-specific terminal age windows", async (t) => {
  const db = createClient({ url: "file::memory:" });
  t.after(async () => db.close());
  await db.execute(`CREATE TABLE navex_parcels (
    code TEXT PRIMARY KEY, phone TEXT NOT NULL, phone2 TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL CHECK (state IN ('pending','depot','in_transit','delivered','returned','to_verify','exchange','unserious','other')),
    state_raw TEXT NOT NULL DEFAULT '', motif TEXT NOT NULL DEFAULT '',
    parcel_date TEXT, order_id INTEGER, first_seen_at TEXT NOT NULL,
    state_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL
  )`);
  await db.execute(`CREATE TABLE navex_sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1), last_sync_at TEXT, last_status TEXT,
    last_count INTEGER, last_error TEXT
  )`);
  const now = new Date();
  for (let index = 0; index < 201; index += 1) {
    await db.execute({
      sql: `INSERT INTO navex_parcels
        (code, phone, state, parcel_date, first_seen_at, state_changed_at, updated_at)
        VALUES (?, '21234567', 'pending', ?, ?, ?, ?)` ,
      args: [
        String(index + 1).padStart(12, "0"),
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
        new Date(now.getTime() - (201 - index) * 60_000).toISOString(),
      ],
    });
  }
  await db.execute({
    sql: `INSERT INTO navex_parcels
      (code, phone, state, parcel_date, first_seen_at, updated_at)
      VALUES ('777777777777', '21234567', 'pending', NULL, ?, ?)`,
    args: [
      new Date(now.getTime() - 61 * 24 * 60 * 60 * 1000).toISOString(),
      now.toISOString(),
      now.toISOString(),
    ],
  });
  await db.execute({
    sql: `INSERT INTO navex_parcels
      (code, phone, state, parcel_date, first_seen_at, state_changed_at, updated_at)
      VALUES ('999999999999', '21234567', 'delivered', ?, ?, datetime('now', '-4 days'), datetime('now', '-4 days'))`,
    args: [
      now.toISOString(),
      now.toISOString(),
    ],
  });
  await db.execute({
    sql: `INSERT INTO navex_parcels
      (code, phone, state, parcel_date, first_seen_at, state_changed_at, updated_at)
      VALUES ('888888888888', '21234567', 'returned', ?, ?, datetime('now', '-2 days'), datetime('now', '-2 days'))`,
    args: [
      now.toISOString(),
      now.toISOString(),
    ],
  });
  await db.execute({
    sql: `INSERT INTO navex_parcels
      (code, phone, state, parcel_date, first_seen_at, state_changed_at, updated_at)
      VALUES ('666666666666', '21234567', 'unserious', ?, ?, datetime('now', '-10 days'), datetime('now', '-10 days'))`,
    args: [now.toISOString(), now.toISOString()],
  });
  await db.execute({
    sql: `INSERT INTO navex_parcels
      (code, phone, state, parcel_date, first_seen_at, state_changed_at, updated_at)
      VALUES ('555555555555', '21234567', 'returned', ?, ?, datetime('now', '-15 days'), datetime('now', '-15 days'))`,
    args: [now.toISOString(), now.toISOString()],
  });
  await db.execute({
    sql: `INSERT INTO navex_parcels
      (code, phone, state, parcel_date, first_seen_at, state_changed_at, updated_at)
      VALUES ('444444444444', '21234567', 'delivered', ?, ?, datetime('now', '-2 days'), datetime('now', '-2 days'))`,
    args: [now.toISOString(), now.toISOString()],
  });
  const requestedCodes = [];
  const client = {
    async getStates(codes) {
      requestedCodes.push(...codes);
      return codes.map((code) => ({
        status: 1,
        code,
        etat: "En cours",
        motif: null,
        pre_etat: null,
        pre_motif: null,
      }));
    },
  };
  const result = await refreshParcelStatesWithDb(client, db, { now });
  assert.equal(result.processed, 100);
  assert.equal(result.updated, 100);
  assert.equal(result.notFound, 0);
  assert.equal(requestedCodes[0], "666666666666");
  assert.equal(requestedCodes.includes("999999999999"), false);
  assert.equal(requestedCodes.includes("888888888888"), true);
  assert.equal(requestedCodes.includes("666666666666"), true);
  assert.equal(requestedCodes.includes("444444444444"), true);
  assert.equal(requestedCodes.includes("555555555555"), false);
  assert.equal(requestedCodes.includes("777777777777"), false);
});

test("state refresh stops starting API batches after thirty seconds", async (t) => {
  const db = createClient({ url: "file::memory:" });
  t.after(async () => db.close());
  await db.execute(`CREATE TABLE navex_parcels (
    code TEXT PRIMARY KEY, phone TEXT NOT NULL, state TEXT NOT NULL,
    state_raw TEXT NOT NULL DEFAULT '', motif TEXT NOT NULL DEFAULT '',
    parcel_date TEXT, first_seen_at TEXT NOT NULL,
    state_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL
  )`);
  await db.execute(`CREATE TABLE navex_sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1), last_sync_at TEXT, last_status TEXT,
    last_count INTEGER, last_error TEXT
  )`);
  const now = new Date();
  for (let index = 0; index < 45; index += 1) {
    await db.execute({
      sql: `INSERT INTO navex_parcels
        (code, phone, state, parcel_date, first_seen_at, state_changed_at, updated_at)
        VALUES (?, '21234567', 'pending', ?, ?, '2001-01-01', datetime('now', ?))`,
      args: [
        String(500000000000 + index),
        now.toISOString(),
        now.toISOString(),
        `-${45 - index} minutes`,
      ],
    });
  }
  let time = 10_000;
  const requestedBatches = [];
  const result = await refreshParcelStatesWithDb(
    {
      async getStates(codes) {
        requestedBatches.push(codes);
        time = 40_001;
        return codes.map((code) => ({
          status: 1,
          code,
          etat: "En attente",
          motif: null,
        }));
      },
    },
    db,
    { now, clock: () => time }
  );
  assert.deepEqual(result, {
    processed: 20,
    updated: 20,
    notFound: 0,
    truncated: true,
  });
  assert.equal(requestedBatches.length, 1);
  assert.equal(requestedBatches[0].length, 20);
});

test("missing parcel codes move behind other parcels for the next refresh", async (t) => {
  const db = createClient({ url: "file::memory:" });
  t.after(async () => db.close());
  await db.execute(`CREATE TABLE navex_parcels (
    code TEXT PRIMARY KEY, phone TEXT NOT NULL, state TEXT NOT NULL,
    state_raw TEXT NOT NULL DEFAULT '', motif TEXT NOT NULL DEFAULT '',
    parcel_date TEXT, first_seen_at TEXT NOT NULL,
    state_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL
  )`);
  await db.execute(`CREATE TABLE navex_sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1), last_sync_at TEXT, last_status TEXT,
    last_count INTEGER, last_error TEXT
  )`);
  const now = new Date();
  for (let index = 0; index < 120; index += 1) {
    await db.execute({
      sql: `INSERT INTO navex_parcels
        (code, phone, state, parcel_date, first_seen_at, state_changed_at, updated_at)
        VALUES (?, '21234567', 'pending', ?, ?, '2001-01-01', datetime('now', ?))`,
      args: [
        String(600000000000 + index),
        now.toISOString(),
        now.toISOString(),
        `-${120 - index} minutes`,
      ],
    });
  }

  const firstBatchCodes = [];
  const firstResult = await refreshParcelStatesWithDb({
    async getStates(codes) {
      firstBatchCodes.push(...codes);
      return codes.map((code) => ({
        status: 0,
        code,
        etat: "",
        status_message: "not found",
      }));
    },
  }, db, { now });
  assert.equal(firstResult.processed, 100);
  assert.equal(firstResult.notFound, 100);
  assert.equal(firstResult.updated, 0);
  const notFoundParcel = await db.execute({
    sql: `SELECT state, state_changed_at,
                 datetime(updated_at) >= datetime('now', '-1 minute') AS recently_checked
          FROM navex_parcels WHERE code = ?`,
    args: [firstBatchCodes[0]],
  });
  assert.equal(notFoundParcel.rows[0].state, "pending");
  assert.equal(notFoundParcel.rows[0].state_changed_at, "2001-01-01");
  assert.equal(Number(notFoundParcel.rows[0].recently_checked), 1);

  const nextPassCodes = [];
  const untouchedCodes = Array.from({ length: 20 }, (_, index) =>
    String(600000000100 + index)
  );
  let omittedCode = "";
  await refreshParcelStatesWithDb({
    async getStates(codes) {
      nextPassCodes.push(...codes);
      omittedCode ||= codes.find((code) => code === untouchedCodes[0]) ?? "";
      return codes.filter((code) => code !== untouchedCodes[0]).map((code) => ({
        status: 1,
        code,
        etat: "En attente",
        motif: null,
      }));
    },
  }, db, { now });
  assert.ok(untouchedCodes.every((code) => nextPassCodes.includes(code)));
  assert.ok(firstBatchCodes.every((code) => !untouchedCodes.includes(code)));
  assert.equal(omittedCode, untouchedCodes[0]);
  const omittedParcel = await db.execute({
    sql: `SELECT state, state_changed_at,
                 datetime(updated_at) >= datetime('now', '-1 minute') AS recently_checked
          FROM navex_parcels WHERE code = ?`,
    args: [omittedCode],
  });
  assert.equal(omittedParcel.rows[0].state, "pending");
  assert.equal(omittedParcel.rows[0].state_changed_at, "2001-01-01");
  assert.equal(Number(omittedParcel.rows[0].recently_checked), 1);
});
