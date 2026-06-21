/**
 * Import users from old data/users.json into the dev database.
 * Skips rows whose email already exists (case-insensitive).
 *
 * Usage:
 *   npx tsx scripts/import-users-from-json.ts --dry-run
 *   npx tsx scripts/import-users-from-json.ts
 *   npx tsx scripts/import-users-from-json.ts --file=path/to/users.json
 *
 * Requires DATABASE_URL in .env
 */
import "dotenv/config";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../server/db.ts";
import { importUsers } from "./legacy-import/importUsers.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const DEFAULT_FILE = join(ROOT_DIR, "old data", "users.json");

function parseArgs(argv: string[]) {
  let file = DEFAULT_FILE;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--file=")) file = arg.slice("--file=".length);
  }
  return { file, dryRun };
}

async function main() {
  const { file, dryRun } = parseArgs(process.argv.slice(2));
  const result = await importUsers({ dryRun, filePath: file });

  console.log(`File: ${file}`);
  console.log(`Total in JSON: ${result.total}`);
  console.log(`Skipped: ${result.skipped}`);
  if (result.details) {
    console.log(`  email exists: ${result.details.skippedEmail}`);
    console.log(`  id conflict: ${result.details.skippedId}`);
    console.log(`  invalid: ${result.details.skippedInvalid}`);
  }
  console.log(`To insert: ${dryRun ? result.inserted : result.inserted}`);
  if (!dryRun) {
    console.log(`Inserted: ${result.inserted}`);
    if (result.failed > 0) console.log(`Failed: ${result.failed}`);
  } else {
    console.log("Dry run — no rows inserted.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
