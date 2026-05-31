-- Patient chats as conversations; remove legacy health_wall tables.

ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS conversation_id varchar REFERENCES conversations(id) ON DELETE SET NULL;

ALTER TABLE users
  DROP COLUMN IF EXISTS health_wall_last_message_at,
  DROP COLUMN IF EXISTS health_wall_last_message_preview;

DROP TABLE IF EXISTS health_wall_message_deliveries CASCADE;
DROP TABLE IF EXISTS health_wall_message_reactions CASCADE;
DROP TABLE IF EXISTS health_wall_messages CASCADE;
DROP TABLE IF EXISTS health_wall_doctors CASCADE;

-- Orphan legacy direct chats created on invite accept (patient_user_id set).
DELETE FROM conversation_participants
WHERE conversation_id IN (
  SELECT id FROM conversations WHERE type = 'direct' AND patient_user_id IS NOT NULL
);
DELETE FROM conversations WHERE type = 'direct' AND patient_user_id IS NOT NULL;
