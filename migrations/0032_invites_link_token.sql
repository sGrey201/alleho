-- Store plain link token for patient conversation invites so the URL can be reshown while valid.
ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS token varchar(64);
