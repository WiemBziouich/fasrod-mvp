import { createClient, type Client } from "@libsql/client";

let _db: Client | null = null;

function getDb(): Client {
  if (!_db) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (process.env.NODE_ENV === "production" && !url) {
      throw new Error(
        "Missing TURSO_DATABASE_URL in Vercel environment variables."
      );
    }

    if (url) {
      _db = createClient({
        url,
        authToken,
      });
    } else {
      // Local development only
      _db = createClient({
        url: "file:data/orders.db",
      });
    }
  }

  return _db;
}

const db = new Proxy({} as Client, {
  get(_target, prop) {
    const client = getDb();
    const value = (client as any)[prop];

    return typeof value === "function"
      ? value.bind(client)
      : value;
  },
});

export default db;
