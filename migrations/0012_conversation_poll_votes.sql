CREATE TABLE IF NOT EXISTS "conversation_poll_votes" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" varchar NOT NULL REFERENCES "conversation_messages"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "option_index" integer NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_poll_votes_unique_idx"
  ON "conversation_poll_votes" ("message_id", "user_id", "option_index");
CREATE INDEX IF NOT EXISTS "conversation_poll_votes_message_idx"
  ON "conversation_poll_votes" ("message_id");
CREATE INDEX IF NOT EXISTS "conversation_poll_votes_user_idx"
  ON "conversation_poll_votes" ("user_id");
