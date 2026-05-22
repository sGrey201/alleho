CREATE TABLE IF NOT EXISTS "conversation_message_comments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" varchar NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "message_id" varchar NOT NULL REFERENCES "conversation_messages"("id") ON DELETE CASCADE,
  "author_user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "content" text,
  "image_url" text,
  "reply_to_comment_id" varchar,
  "edited_at" timestamp,
  "deleted_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "conversation_message_comments_message_idx"
  ON "conversation_message_comments" ("message_id");
CREATE INDEX IF NOT EXISTS "conversation_message_comments_author_idx"
  ON "conversation_message_comments" ("author_user_id");
CREATE INDEX IF NOT EXISTS "conversation_message_comments_created_idx"
  ON "conversation_message_comments" ("created_at");

CREATE TABLE IF NOT EXISTS "conversation_message_comment_reactions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "comment_id" varchar NOT NULL REFERENCES "conversation_message_comments"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "emoji" varchar(16) NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_message_comment_reactions_unique_idx"
  ON "conversation_message_comment_reactions" ("comment_id", "user_id", "emoji");
CREATE INDEX IF NOT EXISTS "conversation_message_comment_reactions_comment_idx"
  ON "conversation_message_comment_reactions" ("comment_id");
CREATE INDEX IF NOT EXISTS "conversation_message_comment_reactions_user_idx"
  ON "conversation_message_comment_reactions" ("user_id");
