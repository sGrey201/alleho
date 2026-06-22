ALTER TABLE "users" ADD COLUMN "requires_role_selection" boolean DEFAULT false NOT NULL;

UPDATE "users" u
SET "requires_role_selection" = true
WHERE NOT EXISTS (
  SELECT 1
  FROM "invites" i
  WHERE i."accepted_user_id" = u."id"
    AND i."status" = 'accepted'
);
