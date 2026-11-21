CREATE TABLE IF NOT EXISTS ai_consilium_requests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id varchar NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id varchar REFERENCES conversation_messages(id) ON DELETE SET NULL,
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
  photo_count integer NOT NULL DEFAULT 0,
  photos_sent boolean NOT NULL DEFAULT false,
  attempt_count integer NOT NULL DEFAULT 1,
  missing_transcripts integer NOT NULL DEFAULT 0,
  prompt_chars integer,
  response_chars integer,
  http_status integer,
  finish_reason varchar(40),
  error text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_consilium_requests_requested_at_idx
  ON ai_consilium_requests (requested_at);
CREATE INDEX IF NOT EXISTS ai_consilium_requests_user_idx
  ON ai_consilium_requests (requested_by_user_id, requested_at);
CREATE INDEX IF NOT EXISTS ai_consilium_requests_conversation_idx
  ON ai_consilium_requests (conversation_id, requested_at);
CREATE INDEX IF NOT EXISTS ai_consilium_requests_patient_idx
  ON ai_consilium_requests (patient_user_id, requested_at);
CREATE INDEX IF NOT EXISTS ai_consilium_requests_status_idx
  ON ai_consilium_requests (status);
