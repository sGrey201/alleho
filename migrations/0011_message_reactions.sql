CREATE TABLE IF NOT EXISTS "conversation_message_reactions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" varchar NOT NULL REFERENCES "conversation_messages"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "emoji" varchar(16) NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_message_reactions_unique_idx"
  ON "conversation_message_reactions" ("message_id", "user_id", "emoji");
CREATE INDEX IF NOT EXISTS "conversation_message_reactions_message_idx"
  ON "conversation_message_reactions" ("message_id");
CREATE INDEX IF NOT EXISTS "conversation_message_reactions_user_idx"
  ON "conversation_message_reactions" ("user_id");

CREATE TABLE IF NOT EXISTS "health_wall_message_reactions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" varchar NOT NULL REFERENCES "health_wall_messages"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "emoji" varchar(16) NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "health_wall_message_reactions_unique_idx"
  ON "health_wall_message_reactions" ("message_id", "user_id", "emoji");
CREATE INDEX IF NOT EXISTS "health_wall_message_reactions_message_idx"
  ON "health_wall_message_reactions" ("message_id");
CREATE INDEX IF NOT EXISTS "health_wall_message_reactions_user_idx"
  ON "health_wall_message_reactions" ("user_id");
