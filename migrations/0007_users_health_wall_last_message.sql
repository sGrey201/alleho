ALTER TABLE "users" ADD COLUMN "health_wall_last_message_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "health_wall_last_message_preview" text;
--> statement-breakpoint
UPDATE "users" u
SET
  "health_wall_last_message_at" = sub.latest_at,
  "health_wall_last_message_preview" = sub.preview
FROM (
  SELECT DISTINCT ON ("patient_user_id")
    "patient_user_id",
    "created_at" AS latest_at,
    CASE
      WHEN NULLIF(TRIM("content"), '') IS NOT NULL THEN LEFT(TRIM("content"), 500)
      WHEN "image_url" IS NOT NULL AND "image_url" <> '' THEN 'Фото'
      ELSE NULL
    END AS preview
  FROM "health_wall_messages"
  ORDER BY "patient_user_id", "created_at" DESC
) sub
WHERE u."id" = sub."patient_user_id";
