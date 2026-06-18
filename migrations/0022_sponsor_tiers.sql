ALTER TABLE "channel_sponsor_settings"
  ADD COLUMN IF NOT EXISTS "tier1_amount" varchar(64),
  ADD COLUMN IF NOT EXISTS "tier2_amount" varchar(64);

UPDATE "channel_sponsor_settings"
SET "tier1_amount" = "suggested_amount"
WHERE "tier1_amount" IS NULL AND "suggested_amount" IS NOT NULL;

ALTER TABLE "channel_sponsor_settings"
  DROP COLUMN IF EXISTS "suggested_amount";

ALTER TABLE "channel_sponsor_payments"
  ADD COLUMN IF NOT EXISTS "donation_type" varchar(32) NOT NULL DEFAULT 'content';
