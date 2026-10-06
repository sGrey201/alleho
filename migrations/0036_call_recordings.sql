ALTER TABLE conversation_calls
  ADD COLUMN IF NOT EXISTS recording_status varchar(20),
  ADD COLUMN IF NOT EXISTS recording_egress_id varchar,
  ADD COLUMN IF NOT EXISTS recording_object_path text,
  ADD COLUMN IF NOT EXISTS recording_message_id varchar;
