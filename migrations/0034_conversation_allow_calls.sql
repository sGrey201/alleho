ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS allow_calls boolean NOT NULL DEFAULT false;
