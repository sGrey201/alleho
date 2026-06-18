ALTER TABLE "conversation_participants"
  ADD COLUMN IF NOT EXISTS "sponsor_expires_at" timestamp;

CREATE TABLE IF NOT EXISTS "channel_sponsor_settings" (
  "conversation_id" varchar PRIMARY KEY REFERENCES "conversations"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT false,
  "payment_instructions" text,
  "suggested_amount" varchar(64),
  "duration_days" integer NOT NULL DEFAULT 30,
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "channel_sponsor_payments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" varchar NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "receipt_url" text NOT NULL,
  "amount" varchar(64),
  "status" varchar(20) NOT NULL DEFAULT 'granted',
  "duration_days" integer NOT NULL,
  "valid_from" timestamp NOT NULL,
  "valid_until" timestamp NOT NULL,
  "submitted_at" timestamp DEFAULT now(),
  "reviewed_at" timestamp,
  "reviewed_by_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "dispute_reason" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "channel_sponsor_payments_conversation_idx"
  ON "channel_sponsor_payments" ("conversation_id");
CREATE INDEX IF NOT EXISTS "channel_sponsor_payments_user_idx"
  ON "channel_sponsor_payments" ("user_id");
CREATE INDEX IF NOT EXISTS "channel_sponsor_payments_status_idx"
  ON "channel_sponsor_payments" ("status");
