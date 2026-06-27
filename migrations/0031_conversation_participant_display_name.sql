ALTER TABLE conversation_participants
  ADD COLUMN IF NOT EXISTS display_name varchar(255);

-- Backfill doctor-side titles from legacy shared conversation name.
UPDATE conversation_participants cp
SET display_name = c.name
FROM conversations c
WHERE cp.conversation_id = c.id
  AND c.type = 'patient'
  AND cp.role = 'owner'
  AND c.name IS NOT NULL
  AND cp.display_name IS NULL;
