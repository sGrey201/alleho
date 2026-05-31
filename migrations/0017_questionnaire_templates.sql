-- Questionnaire templates and instances; drop legacy user_questionnaires.

CREATE TABLE IF NOT EXISTS questionnaire_templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  structure jsonb NOT NULL DEFAULT '{"root":[]}'::jsonb,
  is_shared boolean NOT NULL DEFAULT false,
  patient_send_count integer NOT NULL DEFAULT 0,
  copy_count integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS questionnaire_templates_owner_idx ON questionnaire_templates(owner_user_id);
CREATE INDEX IF NOT EXISTS questionnaire_templates_shared_idx ON questionnaire_templates(is_shared) WHERE is_shared = true;

CREATE TABLE IF NOT EXISTS questionnaire_instances (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id varchar NOT NULL REFERENCES questionnaire_templates(id) ON DELETE RESTRICT,
  conversation_id varchar NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id varchar REFERENCES conversation_messages(id) ON DELETE SET NULL,
  patient_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  structure_snapshot jsonb NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS questionnaire_instances_conversation_idx ON questionnaire_instances(conversation_id);
CREATE INDEX IF NOT EXISTS questionnaire_instances_patient_idx ON questionnaire_instances(patient_user_id);
CREATE INDEX IF NOT EXISTS questionnaire_instances_doctor_idx ON questionnaire_instances(doctor_user_id);
CREATE INDEX IF NOT EXISTS questionnaire_instances_template_idx ON questionnaire_instances(template_id);

DROP TABLE IF EXISTS user_questionnaires CASCADE;
