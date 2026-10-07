ALTER TABLE conversation_calls
  ALTER COLUMN recording_status TYPE varchar(40);

CREATE TABLE IF NOT EXISTS conversation_call_recording_tracks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id varchar NOT NULL REFERENCES conversation_calls(id) ON DELETE CASCADE,
  room_name text NOT NULL,
  participant_identity text NOT NULL,
  role varchar(20) NOT NULL,
  track_sid text NOT NULL,
  egress_id varchar,
  started_at timestamp,
  ended_at timestamp,
  file_path text,
  status varchar(20) NOT NULL DEFAULT 'recording',
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_recording_tracks_call_idx
  ON conversation_call_recording_tracks (call_id);
CREATE INDEX IF NOT EXISTS call_recording_tracks_egress_idx
  ON conversation_call_recording_tracks (egress_id);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_call_recording_tracks_unique
  ON conversation_call_recording_tracks (call_id, track_sid);
