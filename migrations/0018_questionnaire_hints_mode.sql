ALTER TABLE users
  ADD COLUMN IF NOT EXISTS questionnaire_hints_mode varchar(20) NOT NULL DEFAULT 'icon';
