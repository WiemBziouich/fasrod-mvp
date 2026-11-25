import { existsSync, lstatSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { applyCentralOrderMigrations } from "./central-order-migrations.mjs";

function databasePathFromArgs(args) {
  if (
    args.length !== 2 ||
    args[0] !== "--database" ||
    !args[1] ||
    /^(?:file|https?|libsql):/i.test(args[1])
  ) {
    throw new Error(
      "Usage: node scripts/migrate-central-order-management.mjs --database <existing-local-sqlite-file>"
    );
  }

  const databasePath = resolve(args[1]);
  if (!existsSync(databasePath) || !lstatSync(databasePath).isFile()) {
    throw new Error("The migration target must be an existing regular SQLite file.");
  }
  if (realpathSync(databasePath).toLowerCase() !== databasePath.toLowerCase()) {
    throw new Error("The migration target must not be a symbolic link.");
  }
  return databasePath;
}

async function main() {
  const databasePath = databasePathFromArgs(process.argv.slice(2));
  const db = createClient({ url: pathToFileURL(databasePath).href });
  try {
    const applied = await applyCentralOrderMigrations(db);
    console.info(
      applied.length
        ? `Applied central-order migration version(s): ${applied.join(", ")}.`
        : "Central-order migrations are already up to date."
    );
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Unexpected migration error.";
  console.error(`Central-order migration stopped: ${message}`);
  process.exitCode = 1;
});
