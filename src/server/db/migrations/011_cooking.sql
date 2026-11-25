CREATE TABLE cooking_completion (
  task_id uuid PRIMARY KEY REFERENCES cooking_task(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL,
  option_id uuid NOT NULL,
  serving_revision integer NOT NULL CHECK(serving_revision>0)
);
INSERT INTO cooking_completion(task_id,completed_at,option_id,serving_revision)
SELECT id,(task->>'completedAt')::timestamptz,(task->'completionServing'->>'optionId')::uuid,
  (task->'completionServing'->>'revision')::int FROM cooking_task WHERE state='completed';
CREATE FUNCTION preserve_cooking_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state='completed' THEN
    INSERT INTO cooking_completion(task_id,completed_at,option_id,serving_revision)
    VALUES(NEW.id,(NEW.task->>'completedAt')::timestamptz,(NEW.task->'completionServing'->>'optionId')::uuid,
      (NEW.task->'completionServing'->>'revision')::int) ON CONFLICT(task_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cooking_completion_once AFTER INSERT OR UPDATE ON cooking_task
FOR EACH ROW EXECUTE FUNCTION preserve_cooking_completion();
