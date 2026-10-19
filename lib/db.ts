import { createClient, Client } from "@libsql/client";

let _db: Client | null = null;

function getDb(): Client {
  if (!_db) {
    const url = process.env.TURSO_DATABASE_URL || "file:data/orders.db";
    const authToken = process.env.TURSO_AUTH_TOKEN;
    _db = createClient({ url, authToken });
  }
  return _db;
}

// Proxy that lazily initializes the client on first method call
// This prevents Vercel build from crashing when env vars aren't available at import time
const db = new Proxy({} as Client, {
  get(_target, prop) {
    const client = getDb();
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export default db;
