
import { createHash } from "node:crypto";
import db from "@/lib/db";

const WINDOW_MS = 10 * 60 * 1000;

/**
 * Counts requests in Turso, shared across Vercel instances.
 * Returns true when the request is allowed.
 */
export async function consumeRateLimit(
  identifier: string,
  limit: number
): Promise<boolean> {
  const now = Date.now();

  // Store a hash instead of the raw IP address or phone number.
  const key = createHash("sha256")
    .update(identifier)
    .digest("hex");

  const result = await db.execute({
    sql: `
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE
          WHEN rate_limits.window_start <= ? THEN 1
          ELSE rate_limits.count + 1
        END,
        window_start = CASE
          WHEN rate_limits.window_start <= ? THEN excluded.window_start
          ELSE rate_limits.window_start
        END
      RETURNING count
    `,
    args: [
      key,
      now,
      now - WINDOW_MS,
      now - WINDOW_MS,
    ],
  });

  const count = Number(result.rows[0]?.count ?? 0);

  return count > 0 && count <= limit;
}
