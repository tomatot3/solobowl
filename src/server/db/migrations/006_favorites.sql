CREATE TABLE favorite (
  account_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES recipe(id),
  version_id uuid NOT NULL,
  saved boolean NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,recipe_id),
  FOREIGN KEY(version_id,recipe_id) REFERENCES recipe_version(id,recipe_id)
);
CREATE FUNCTION record_favorite_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sync_change(account_id,entity_type,entity_id,revision,kind)
  VALUES(NEW.account_id,'favorite',NEW.recipe_id::text,NEW.revision,CASE WHEN NEW.saved THEN 'upsert' ELSE 'delete' END);
  IF NOT NEW.saved THEN
    INSERT INTO sync_barrier VALUES(NEW.account_id,'favorite',NEW.recipe_id::text,1)
    ON CONFLICT(account_id,entity_type,entity_id) DO UPDATE SET generation=sync_barrier.generation+1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER favorite_sync_change AFTER INSERT OR UPDATE ON favorite
FOR EACH ROW EXECUTE FUNCTION record_favorite_sync();
