ALTER TABLE "conversations" ADD COLUMN "last_message_at" timestamp;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_message_preview" text;
--> statement-breakpoint
UPDATE "conversations" c
SET
  "last_message_at" = lm.latest_at,
  "last_message_preview" = lm.preview
FROM (
  SELECT DISTINCT ON ("conversation_id")
    "conversation_id",
    "created_at" AS latest_at,
    CASE
      WHEN NULLIF(TRIM("content"), '') IS NOT NULL THEN LEFT(TRIM("content"), 500)
      WHEN "image_url" IS NOT NULL AND "image_url" <> '' THEN 'Фото'
      ELSE NULL
    END AS preview
  FROM "conversation_messages"
  ORDER BY "conversation_id", "created_at" DESC
) lm
WHERE c."id" = lm."conversation_id";
