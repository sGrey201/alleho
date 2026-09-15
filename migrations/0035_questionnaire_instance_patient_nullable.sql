-- Allow questionnaire instances in pending patient chats (before invite accept).
-- patient_user_id is bound on invite accept (backfill) or on first save from conversation.patient_user_id.

ALTER TABLE questionnaire_instances
  ALTER COLUMN patient_user_id DROP NOT NULL;
