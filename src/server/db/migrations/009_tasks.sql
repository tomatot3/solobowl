CREATE TABLE cooking_task (
  account_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  id uuid PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES recipe_version(id),
  state text NOT NULL CHECK(state IN ('todo','cooking','completed','cancelled')),
  revision integer NOT NULL CHECK(revision > 0),
  task jsonb NOT NULL,
  CHECK(task->>'id'=id::text AND task->'snapshot'->>'id'=version_id::text AND task->>'state'=state)
);
CREATE UNIQUE INDEX cooking_task_active_unique ON cooking_task(account_id,version_id) WHERE state IN ('todo','cooking');
CREATE INDEX cooking_task_account ON cooking_task(account_id);
CREATE TABLE cooking_operation (
  account_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  request_hash text NOT NULL,
  task_id uuid,
  PRIMARY KEY(account_id,id)
);
