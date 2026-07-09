ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

ALTER TABLE conversation_participants
  ADD COLUMN IF NOT EXISTS membership_status varchar(20) NOT NULL DEFAULT 'active';
