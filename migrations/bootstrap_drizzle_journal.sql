-- Run this ONCE if your database already had the initial schema (e.g. from db:push or an old migration)
-- and "drizzle-kit migrate" fails with "relation ... already exists".
-- It marks the first migration (0000_outgoing_harrier) as applied so only 0001_messenger_conversations runs.
--
-- Easiest: npm run migrate:bootstrap   (then run: npm run migrate)
-- Or: psql $DATABASE_URL -f migrations/bootstrap_drizzle_journal.sql

CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

-- Mark 0000_outgoing_harrier as already applied (so migrate will only run 0001 and later).
-- Run only once; skip if you already have a row with this created_at.
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT '0000_outgoing_harrier', 1773386918528
WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = 1773386918528);
