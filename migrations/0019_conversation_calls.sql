CREATE TABLE IF NOT EXISTS "conversation_calls" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" varchar NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "initiated_by_user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL DEFAULT 'ringing',
  "started_at" timestamp,
  "ended_at" timestamp,
  "ring_expires_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "conversation_calls_conversation_idx"
  ON "conversation_calls" ("conversation_id");
CREATE INDEX IF NOT EXISTS "conversation_calls_status_idx"
  ON "conversation_calls" ("status");

-- At most one live (ringing/active) call per conversation.
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_calls_one_active"
  ON "conversation_calls" ("conversation_id")
  WHERE "status" IN ('ringing', 'active');

CREATE TABLE IF NOT EXISTS "conversation_call_participants" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "call_id" varchar NOT NULL REFERENCES "conversation_calls"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL DEFAULT 'invited',
  "responded_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "conversation_call_participants_call_idx"
  ON "conversation_call_participants" ("call_id");
CREATE INDEX IF NOT EXISTS "conversation_call_participants_user_idx"
  ON "conversation_call_participants" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_call_participants_unique"
  ON "conversation_call_participants" ("call_id", "user_id");
