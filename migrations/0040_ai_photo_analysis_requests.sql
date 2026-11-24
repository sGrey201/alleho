CREATE TABLE IF NOT EXISTS ai_photo_analysis_requests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id varchar NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id varchar REFERENCES conversation_messages(id) ON DELETE SET NULL,
  photo_message_id varchar REFERENCES conversation_messages(id) ON DELETE SET NULL,
  requested_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  status varchar(32) NOT NULL,
  requested_at timestamp NOT NULL DEFAULT now(),
  answered_at timestamp,
  model varchar(80),
  provider_request_id varchar,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  reasoning_tokens integer,
  cached_prompt_tokens integer,
  attempt_count integer NOT NULL DEFAULT 1,
  prompt_chars integer,
  response_chars integer,
  http_status integer,
  finish_reason varchar(40),
  error text,
  created_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_photo_analysis_requests_message_uidx
  ON ai_photo_analysis_requests (message_id)
  WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_photo_analysis_requests_requested_at_idx
  ON ai_photo_analysis_requests (requested_at);
CREATE INDEX IF NOT EXISTS ai_photo_analysis_requests_user_idx
  ON ai_photo_analysis_requests (requested_by_user_id, requested_at);
CREATE INDEX IF NOT EXISTS ai_photo_analysis_requests_conversation_idx
  ON ai_photo_analysis_requests (conversation_id, requested_at);
CREATE INDEX IF NOT EXISTS ai_photo_analysis_requests_patient_idx
  ON ai_photo_analysis_requests (patient_user_id, requested_at);
CREATE INDEX IF NOT EXISTS ai_photo_analysis_requests_status_idx
  ON ai_photo_analysis_requests (status);

INSERT INTO ai_photo_analysis_requests (
  conversation_id,
  message_id,
  photo_message_id,
  requested_by_user_id,
  patient_user_id,
  status,
  requested_at,
  response_chars,
  error
)
SELECT
  m.conversation_id,
  m.id,
  (SELECT p.id FROM conversation_messages p WHERE p.id = m.reply_to_message_id),
  m.author_user_id,
  c.patient_user_id,
  CASE
    WHEN m.content IS NULL OR btrim(m.content) = '' THEN 'started'
    WHEN m.content LIKE 'Не удалось подготовить анализ фото.%' THEN 'error'
    ELSE 'finished'
  END,
  COALESCE(m.created_at, now()),
  CASE WHEN m.content IS NULL THEN NULL ELSE char_length(m.content) END,
  CASE
    WHEN m.content LIKE 'Не удалось подготовить анализ фото.%' THEN left(m.content, 500)
    ELSE NULL
  END
FROM conversation_messages m
INNER JOIN conversations c ON c.id = m.conversation_id
WHERE m.message_type = 'photo_analysis'
  AND m.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM ai_photo_analysis_requests r WHERE r.message_id = m.id
  );
