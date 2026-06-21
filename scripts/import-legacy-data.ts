/**
 * Import legacy JSON exports into the dev database.
 *
 * Usage:
 *   npm run import:legacy -- --dry-run
 *   npm run import:legacy -- --only=users
 *   npm run import:legacy -- --only=articles,likes,payments
 */
import "dotenv/config";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../server/db.ts";
import { importArticles } from "./legacy-import/importArticles.ts";
import { importChannelSubscribers } from "./legacy-import/channelMembers.ts";
import { importLikes } from "./legacy-import/importLikes.ts";
import { importSponsorPayments } from "./legacy-import/importSponsorPayments.ts";
import { importUsers } from "./legacy-import/importUsers.ts";
import { loadLegacyUsers } from "./legacy-import/loadJson.ts";
import type { ImportPhaseResult } from "./legacy-import/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_FILE = join(__dirname, "..", "old data", "users.json");

type Phase = "users" | "subscribers" | "articles" | "likes" | "payments";

function parseArgs(argv: string[]) {
  let dryRun = false;
  let only: Phase[] | null = null;

  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--only=")) {
      only = arg
        .slice("--only=".length)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean) as Phase[];
    }
  }

  const allPhases: Phase[] = ["users", "subscribers", "articles", "likes", "payments"];
  return {
    dryRun,
    phases: only?.length ? only : allPhases,
  };
}

function printPhaseResult(name: string, result: ImportPhaseResult) {
  console.log(`\n=== ${name} ===`);
  console.log(`Total: ${result.total}`);
  console.log(`Inserted: ${result.inserted}`);
  console.log(`Skipped: ${result.skipped}`);
  if (result.failed > 0) console.log(`Failed: ${result.failed}`);
  if (result.details) {
    for (const [key, value] of Object.entries(result.details)) {
      console.log(`  ${key}: ${value}`);
    }
  }
}

async function main() {
  const { dryRun, phases } = parseArgs(process.argv.slice(2));
  console.log(dryRun ? "DRY RUN" : "LIVE IMPORT");
  console.log(`Phases: ${phases.join(", ")}`);

  if (phases.includes("users")) {
    const usersResult = await importUsers({
      dryRun,
      filePath: USERS_FILE,
      sourceRows: loadLegacyUsers(),
    });
    printPhaseResult("users", usersResult);
  }

  if (phases.includes("subscribers")) {
    const subscribersResult = await importChannelSubscribers({ dryRun });
    printPhaseResult("subscribers", subscribersResult);
  }

  if (phases.includes("articles")) {
    const articlesResult = await importArticles({ dryRun });
    printPhaseResult("articles", articlesResult);
  }

  if (phases.includes("likes")) {
    const likesResult = await importLikes({ dryRun });
    printPhaseResult("likes", likesResult);
  }

  if (phases.includes("payments")) {
    const paymentsResult = await importSponsorPayments({ dryRun });
    printPhaseResult("payments", paymentsResult);
  }

  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
