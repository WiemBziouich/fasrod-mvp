import { createClient } from "@libsql/client";

const url =
  process.env.TURSO_DATABASE_URL ||
  "file:data/orders.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({
  url,
  authToken,
});

export default db;
