CREATE TABLE IF NOT EXISTS "account_reports" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "reporter_user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reported_user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category" varchar(20) NOT NULL,
  "details" text,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "account_reports_reported_status_idx"
  ON "account_reports" ("reported_user_id", "status");
CREATE INDEX IF NOT EXISTS "account_reports_reporter_reported_idx"
  ON "account_reports" ("reporter_user_id", "reported_user_id");
