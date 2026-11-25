ALTER TABLE cooking_task ADD CONSTRAINT cooking_task_owner_id_unique UNIQUE(account_id,id);
CREATE TABLE guest_task_map (
  account_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  guest_task_id uuid NOT NULL,
  task_id uuid NOT NULL,
  PRIMARY KEY(account_id,guest_task_id),
  FOREIGN KEY(account_id,task_id) REFERENCES cooking_task(account_id,id) ON DELETE CASCADE
);
ALTER TABLE merge_conflict DROP CONSTRAINT merge_conflict_section_check;
ALTER TABLE merge_conflict ADD CONSTRAINT merge_conflict_section_check
  CHECK(section IN ('safety','preferences','today_state') OR section ~ '^task:[a-f0-9-]{36}$');
CREATE TABLE merge_cooking_selection (
  merge_id uuid PRIMARY KEY REFERENCES merge_session(id) ON DELETE CASCADE,
  selected uuid[] NOT NULL DEFAULT '{}',
  edits jsonb NOT NULL DEFAULT '{}'::jsonb
);
