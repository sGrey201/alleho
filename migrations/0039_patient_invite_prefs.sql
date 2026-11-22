ALTER TABLE users ADD COLUMN IF NOT EXISTS patient_invite_greeting text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_patient_questionnaire_template_id varchar;
