ALTER TABLE "channel_sponsor_settings"
  ADD COLUMN IF NOT EXISTS "content_renewal_discount_percent" integer NOT NULL DEFAULT 0;
