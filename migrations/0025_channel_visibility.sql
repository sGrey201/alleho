ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS patient_available boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false;
