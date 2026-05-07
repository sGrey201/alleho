ALTER TABLE "conversation_messages"
  ADD COLUMN IF NOT EXISTS "reply_to_message_id" varchar,
  ADD COLUMN IF NOT EXISTS "forwarded_from_message_id" varchar,
  ADD COLUMN IF NOT EXISTS "forwarded_from_user_id" varchar,
  ADD COLUMN IF NOT EXISTS "edited_at" timestamp,
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "pinned_at" timestamp,
  ADD COLUMN IF NOT EXISTS "pinned_by_user_id" varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'conversation_messages'
      AND constraint_name = 'conversation_messages_reply_to_message_id_fkey'
  ) THEN
    ALTER TABLE "conversation_messages"
      ADD CONSTRAINT "conversation_messages_reply_to_message_id_fkey"
      FOREIGN KEY ("reply_to_message_id")
      REFERENCES "conversation_messages"("id")
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'conversation_messages'
      AND constraint_name = 'conversation_messages_forwarded_from_message_id_fkey'
  ) THEN
    ALTER TABLE "conversation_messages"
      ADD CONSTRAINT "conversation_messages_forwarded_from_message_id_fkey"
      FOREIGN KEY ("forwarded_from_message_id")
      REFERENCES "conversation_messages"("id")
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'conversation_messages'
      AND constraint_name = 'conversation_messages_forwarded_from_user_id_fkey'
  ) THEN
    ALTER TABLE "conversation_messages"
      ADD CONSTRAINT "conversation_messages_forwarded_from_user_id_fkey"
      FOREIGN KEY ("forwarded_from_user_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'conversation_messages'
      AND constraint_name = 'conversation_messages_pinned_by_user_id_fkey'
  ) THEN
    ALTER TABLE "conversation_messages"
      ADD CONSTRAINT "conversation_messages_pinned_by_user_id_fkey"
      FOREIGN KEY ("pinned_by_user_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "conversation_messages_pinned_idx"
  ON "conversation_messages" ("conversation_id", "pinned_at");
