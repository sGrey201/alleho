CREATE TABLE IF NOT EXISTS "conversation_message_deliveries" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" varchar NOT NULL REFERENCES "conversation_messages"("id") ON DELETE CASCADE,
  "recipient_user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "delivered_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_message_deliveries_unique"
  ON "conversation_message_deliveries" ("message_id", "recipient_user_id");
CREATE INDEX IF NOT EXISTS "conversation_message_deliveries_message_idx"
  ON "conversation_message_deliveries" ("message_id");

CREATE TABLE IF NOT EXISTS "health_wall_message_deliveries" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" varchar NOT NULL REFERENCES "health_wall_messages"("id") ON DELETE CASCADE,
  "recipient_user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "delivered_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "health_wall_message_deliveries_unique"
  ON "health_wall_message_deliveries" ("message_id", "recipient_user_id");
CREATE INDEX IF NOT EXISTS "health_wall_message_deliveries_message_idx"
  ON "health_wall_message_deliveries" ("message_id");
