ALTER TABLE "conversations" ADD COLUMN "deleted_at" timestamp;

CREATE INDEX "conversations_deleted_at_idx" ON "conversations" ("deleted_at");
