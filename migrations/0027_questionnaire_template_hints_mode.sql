ALTER TABLE questionnaire_templates
  ADD COLUMN IF NOT EXISTS hints_mode varchar(20) NOT NULL DEFAULT 'icon';

ALTER TABLE questionnaire_instances
  ADD COLUMN IF NOT EXISTS hints_mode_snapshot varchar(20) NOT NULL DEFAULT 'icon';

UPDATE questionnaire_templates qt
SET hints_mode = u.questionnaire_hints_mode
FROM users u
WHERE qt.owner_user_id = u.id
  AND u.questionnaire_hints_mode IN ('always', 'icon');

UPDATE questionnaire_instances qi
SET hints_mode_snapshot = qt.hints_mode
FROM questionnaire_templates qt
WHERE qi.template_id = qt.id;
