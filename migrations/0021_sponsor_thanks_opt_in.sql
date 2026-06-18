ALTER TABLE "conversation_participants"
  ADD COLUMN IF NOT EXISTS "show_in_sponsor_thanks" boolean NOT NULL DEFAULT false;
