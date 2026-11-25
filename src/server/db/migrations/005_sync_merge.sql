CREATE TABLE sync_receipt (
  account_id uuid REFERENCES "user"(id) ON DELETE CASCADE,
  operation_id uuid,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY(account_id,operation_id)
);

CREATE TABLE sync_change (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  revision integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('upsert','delete')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_change_account_cursor ON sync_change(account_id,sequence);
CREATE TABLE sync_barrier (
  account_id uuid REFERENCES "user"(id) ON DELETE CASCADE,
  entity_type text,
  entity_id text,
  generation integer NOT NULL CHECK(generation > 0),
  PRIMARY KEY(account_id,entity_type,entity_id)
);

CREATE TABLE merge_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','partial','completed','cancelled')),
  revision integer NOT NULL DEFAULT 1,
  applied text[] NOT NULL DEFAULT '{}',
  UNIQUE(account_id,batch_id),
  UNIQUE(id,account_id)
);
CREATE TABLE merge_conflict (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merge_id uuid NOT NULL,
  account_id uuid NOT NULL,
  section text NOT NULL CHECK(section IN ('safety','preferences','today_state')),
  account_revision integer NOT NULL,
  deletion_generation integer NOT NULL,
  guest_values jsonb NOT NULL,
  FOREIGN KEY(merge_id,account_id) REFERENCES merge_session(id,account_id) ON DELETE CASCADE,
  UNIQUE(merge_id,section)
);
CREATE INDEX merge_conflict_owner ON merge_conflict(account_id,section);

CREATE TABLE sync_conflict (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  request_hash text NOT NULL,
  section text NOT NULL CHECK(section IN ('safety','preferences')),
  deletion_generation integer NOT NULL,
  consent_id uuid NOT NULL REFERENCES profile_consent(id) ON DELETE CASCADE,
  proposed jsonb NOT NULL,
  UNIQUE(account_id,operation_id)
);
CREATE INDEX sync_conflict_account_section ON sync_conflict(account_id,section);

CREATE FUNCTION record_profile_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sync_change(account_id,entity_type,entity_id,revision,kind)
  VALUES(NEW.account_id,'profile',NEW.section,NEW.revision,CASE WHEN NEW.state='unknown' THEN 'delete' ELSE 'upsert' END);
  IF NEW.deletion_generation > COALESCE(OLD.deletion_generation,0) THEN
    INSERT INTO sync_barrier VALUES(NEW.account_id,'profile',NEW.section,NEW.deletion_generation)
    ON CONFLICT(account_id,entity_type,entity_id) DO UPDATE SET generation=EXCLUDED.generation;
    DELETE FROM merge_conflict WHERE account_id=NEW.account_id AND section=NEW.section
      AND deletion_generation<NEW.deletion_generation;
    DELETE FROM sync_conflict WHERE account_id=NEW.account_id AND section=NEW.section
      AND deletion_generation<NEW.deletion_generation;
    UPDATE merge_session m SET status='cancelled',revision=revision+1
    WHERE m.account_id=NEW.account_id AND m.status IN ('pending','partial')
      AND NOT EXISTS(SELECT 1 FROM merge_conflict WHERE merge_id=m.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profile_sync_change AFTER INSERT OR UPDATE ON profile_section
FOR EACH ROW EXECUTE FUNCTION record_profile_sync();

CREATE FUNCTION record_consent_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sync_change(account_id,entity_type,entity_id,revision,kind)
  VALUES(NEW.account_id,'consent',NEW.id::text,CASE WHEN NEW.revoked_at IS NULL THEN 1 ELSE 2 END,
    CASE WHEN NEW.revoked_at IS NULL THEN 'upsert' ELSE 'delete' END);
  IF NEW.revoked_at IS NOT NULL THEN
    DELETE FROM merge_conflict WHERE account_id=NEW.account_id AND section=NEW.purpose;
    DELETE FROM sync_conflict WHERE account_id=NEW.account_id AND section=NEW.purpose;
    UPDATE merge_session m SET status='cancelled',revision=revision+1
    WHERE m.account_id=NEW.account_id AND m.status IN ('pending','partial')
      AND NOT EXISTS(SELECT 1 FROM merge_conflict WHERE merge_id=m.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER consent_sync_change AFTER INSERT OR UPDATE ON profile_consent
FOR EACH ROW EXECUTE FUNCTION record_consent_sync();

CREATE FUNCTION record_today_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    INSERT INTO sync_barrier VALUES(OLD.account_id,'today_state',to_char(OLD.business_date,'YYYY-MM-DD'),1)
    ON CONFLICT(account_id,entity_type,entity_id) DO UPDATE SET generation=sync_barrier.generation+1;
    INSERT INTO sync_change(account_id,entity_type,entity_id,revision,kind)
    VALUES(OLD.account_id,'today_state',to_char(OLD.business_date,'YYYY-MM-DD'),OLD.revision+1,'delete');
    DELETE FROM merge_conflict WHERE account_id=OLD.account_id AND section='today_state'
      AND guest_values->>'businessDate'=to_char(OLD.business_date,'YYYY-MM-DD');
    UPDATE merge_session m SET status='cancelled',revision=revision+1
    WHERE m.account_id=OLD.account_id AND m.status IN ('pending','partial')
      AND NOT EXISTS(SELECT 1 FROM merge_conflict WHERE merge_id=m.id);
    RETURN OLD;
  END IF;
  INSERT INTO sync_change(account_id,entity_type,entity_id,revision,kind)
  VALUES(NEW.account_id,'today_state',to_char(NEW.business_date,'YYYY-MM-DD'),NEW.revision,'upsert');
  RETURN NEW;
END $$;
CREATE TRIGGER today_sync_change AFTER INSERT OR UPDATE OR DELETE ON today_state
FOR EACH ROW EXECUTE FUNCTION record_today_sync();
