ALTER TABLE "conversation_participants"
  ADD COLUMN IF NOT EXISTS "sponsor_listing_expires_at" timestamp;

ALTER TABLE "channel_sponsor_settings"
  ADD COLUMN IF NOT EXISTS "content_duration_days" integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "sponsor_duration_days" integer NOT NULL DEFAULT 30;

UPDATE "channel_sponsor_settings"
SET
  "content_duration_days" = "duration_days",
  "sponsor_duration_days" = "duration_days";

UPDATE "conversation_participants"
SET "sponsor_listing_expires_at" = "sponsor_expires_at"
WHERE "show_in_sponsor_thanks" = true
  AND "sponsor_expires_at" IS NOT NULL
  AND "sponsor_listing_expires_at" IS NULL;
