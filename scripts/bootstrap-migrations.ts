/**
 * Marks the first migration (0000_outgoing_harrier) as already applied in drizzle.__drizzle_migrations.
 * Run this once if the DB already has the initial schema and "npm run migrate" fails with "relation ... already exists".
 * Then run "npm run migrate" again to apply only 0001_messenger_conversations and any later migrations.
 *
 * Usage: npx tsx scripts/bootstrap-migrations.ts
 * (requires DATABASE_URL in env or .env)
 */
import "dotenv/config";
import pg from "pg";

const sql = `
CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT '0000_outgoing_harrier', 1773386918528
WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = 1773386918528);
`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.query(sql);
    const r = await client.query("SELECT COUNT(*) FROM drizzle.__drizzle_migrations WHERE created_at = 1773386918528");
    const count = parseInt(r.rows[0]?.count ?? "0", 10);
    if (count > 0) {
      console.log("Bootstrap done. Migration 0000_outgoing_harrier is marked as applied.");
      console.log("Run: npm run migrate");
    } else {
      console.log("Bootstrap run (row may already exist). Run: npm run migrate");
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
