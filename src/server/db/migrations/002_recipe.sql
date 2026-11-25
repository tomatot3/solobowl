-- 同菜谱最多一个当前可推荐版本；内容不可变；完整度0—1不等于发布。
CREATE TABLE recipe(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id text NOT NULL UNIQUE,
 current_published_version_id uuid
);
CREATE TABLE recipe_version(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipe_id uuid NOT NULL REFERENCES recipe(id),
 internal_revision integer NOT NULL CHECK(internal_revision>0),raw_version text NOT NULL,
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-fA-F0-9]{64}$'),content_hash text NOT NULL CHECK(content_hash ~ '^[a-fA-F0-9]{64}$'),
 name text NOT NULL CHECK(length(trim(name))>0),image text,
 prep_minutes numeric CHECK(prep_minutes>=0 AND prep_minutes< 'Infinity'::numeric),cook_minutes numeric CHECK(cook_minutes>=0 AND cook_minutes< 'Infinity'::numeric),
 total_minutes numeric GENERATED ALWAYS AS (CASE WHEN prep_minutes IS NOT NULL AND cook_minutes IS NOT NULL THEN prep_minutes+cook_minutes ELSE NULL END) STORED,
 difficulty text,equipment text[],season text CHECK(season IN('spring','summer','autumn','winter')),
 term_codes text[] NOT NULL DEFAULT '{}',tags text[] NOT NULL DEFAULT '{}',dish_type text,
 completeness numeric NOT NULL CHECK(completeness>=0 AND completeness<=1),
 allergen_ids text[],allergens_reviewed boolean NOT NULL DEFAULT false,restriction_ids text[] NOT NULL DEFAULT '{}',
 sealed boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(recipe_id,internal_revision),UNIQUE(id,recipe_id),
 CHECK(term_codes <@ ARRAY['lidong','xiaoxue','daxue','dongzhi','xiaohan','dahan']::text[])
);
ALTER TABLE recipe ADD CONSTRAINT recipe_current_version_fk FOREIGN KEY(current_published_version_id,id) REFERENCES recipe_version(id,recipe_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE recipe_lifecycle(
 version_id uuid PRIMARY KEY,recipe_id uuid NOT NULL,state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','reviewed','published','archived','safety_withdrawn')),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),changed_at timestamptz NOT NULL DEFAULT now(),withdrawal_reason text,
 FOREIGN KEY(version_id,recipe_id) REFERENCES recipe_version(id,recipe_id)
);
CREATE UNIQUE INDEX one_published_version_per_recipe ON recipe_lifecycle(recipe_id) WHERE state='published';
CREATE TABLE source_evidence(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),version_id uuid NOT NULL REFERENCES recipe_version(id),
 source_type text NOT NULL CHECK(source_type IN('original','adaptation','traditional_explanation','modern_advice')),
 citation text NOT NULL CHECK(length(trim(citation))>0),evidence_level text,directory_version text,source_location text,
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-fA-F0-9]{64}$'),UNIQUE(id,version_id)
);
CREATE TABLE content_review(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),version_id uuid NOT NULL REFERENCES recipe_version(id),
 scope text NOT NULL CHECK(scope IN('content','servings','steps','sources','dictionary','safety')),
 status text NOT NULL CHECK(status IN('pending','approved','rejected')),reviewer text,reviewed_at timestamptz,evidence_id uuid,
 FOREIGN KEY(evidence_id,version_id) REFERENCES source_evidence(id,version_id),UNIQUE(id,version_id),
 CHECK(status<>'approved' OR (length(trim(reviewer))>0 AND reviewer IS NOT NULL AND reviewed_at IS NOT NULL AND evidence_id IS NOT NULL))
);
CREATE TABLE ingredient_line(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),version_id uuid NOT NULL REFERENCES recipe_version(id),ordinal integer NOT NULL CHECK(ordinal>0),
 ingredient_id text,raw_name text NOT NULL CHECK(length(trim(raw_name))>0),role text NOT NULL CHECK(role IN('main','secondary','seasoning','auxiliary_water')),
 amount_kind text NOT NULL CHECK(amount_kind IN('numeric','text','unknown')),quantity numeric CHECK(quantity>=0 AND quantity<'Infinity'::numeric),unit text,quantity_text text,
 optional boolean NOT NULL DEFAULT false,shopping_included boolean NOT NULL DEFAULT true,
 UNIQUE(version_id,ordinal),UNIQUE(id,version_id),
 CHECK((amount_kind='numeric' AND quantity IS NOT NULL AND quantity_text IS NULL) OR (amount_kind='text' AND quantity IS NULL AND quantity_text IS NOT NULL AND length(trim(quantity_text))>0) OR (amount_kind='unknown' AND quantity IS NULL AND quantity_text IS NULL)),
 CHECK(role<>'auxiliary_water' OR NOT shopping_included)
);
CREATE TABLE recipe_step(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),version_id uuid NOT NULL REFERENCES recipe_version(id),ordinal integer NOT NULL CHECK(ordinal>0),
 instruction text NOT NULL CHECK(length(trim(instruction))>0),heat text,duration_seconds integer CHECK(duration_seconds>=0),
 timer_start_cue text,completion_cue text,safety_notice text,UNIQUE(version_id,ordinal),UNIQUE(id,version_id)
);
CREATE TABLE step_ingredient(
 version_id uuid NOT NULL,step_id uuid NOT NULL,line_id uuid NOT NULL,PRIMARY KEY(step_id,line_id),
 FOREIGN KEY(step_id,version_id) REFERENCES recipe_step(id,version_id),FOREIGN KEY(line_id,version_id) REFERENCES ingredient_line(id,version_id)
);
-- 每个选项有审核依据；无依据仅一人份；不按份数自动倍增时长。
CREATE TABLE serving_option(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),version_id uuid NOT NULL REFERENCES recipe_version(id),servings numeric NOT NULL CHECK(servings>0 AND servings<'Infinity'::numeric),review_ref uuid,
 FOREIGN KEY(review_ref,version_id) REFERENCES content_review(id,version_id),UNIQUE(id,version_id),CHECK(review_ref IS NOT NULL OR servings=1)
);
CREATE TABLE serving_quantity(
 version_id uuid NOT NULL,option_id uuid NOT NULL,line_id uuid NOT NULL,quantity numeric CHECK(quantity>=0 AND quantity<'Infinity'::numeric),unit text,quantity_text text,
 PRIMARY KEY(option_id,line_id),FOREIGN KEY(option_id,version_id) REFERENCES serving_option(id,version_id),FOREIGN KEY(line_id,version_id) REFERENCES ingredient_line(id,version_id),
 CHECK(NOT(quantity IS NOT NULL AND quantity_text IS NOT NULL))
);
CREATE TABLE serving_step_override(
 version_id uuid NOT NULL,option_id uuid NOT NULL,step_id uuid NOT NULL,duration_seconds integer CHECK(duration_seconds>=0),heat text,
 PRIMARY KEY(option_id,step_id),FOREIGN KEY(option_id,version_id) REFERENCES serving_option(id,version_id),FOREIGN KEY(step_id,version_id) REFERENCES recipe_step(id,version_id)
);
CREATE FUNCTION protect_version_content() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; locked boolean;
BEGIN
 IF TG_TABLE_NAME='recipe_version' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.sealed THEN RAISE EXCEPTION 'RECIPE_MUST_START_UNSEALED' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  IF OLD.sealed THEN RAISE EXCEPTION 'IMMUTABLE_RECIPE_CONTENT' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND NEW.sealed THEN
   IF NOT EXISTS(SELECT 1 FROM ingredient_line WHERE version_id=NEW.id) OR NOT EXISTS(SELECT 1 FROM recipe_step WHERE version_id=NEW.id) OR NOT EXISTS(SELECT 1 FROM serving_option WHERE version_id=NEW.id AND servings=1) THEN RAISE EXCEPTION 'INCOMPLETE_RECIPE_CONTENT' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM (SELECT ordinal,row_number() OVER(ORDER BY ordinal) AS expected FROM ingredient_line WHERE version_id=NEW.id) s WHERE ordinal<>expected) OR EXISTS(SELECT 1 FROM (SELECT ordinal,row_number() OVER(ORDER BY ordinal) AS expected FROM recipe_step WHERE version_id=NEW.id) s WHERE ordinal<>expected) THEN RAISE EXCEPTION 'NONCONTIGUOUS_RECIPE_ORDER' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM serving_option o CROSS JOIN ingredient_line l WHERE o.version_id=NEW.id AND l.version_id=NEW.id AND NOT EXISTS(SELECT 1 FROM serving_quantity q WHERE q.option_id=o.id AND q.line_id=l.id)) THEN RAISE EXCEPTION 'INCOMPLETE_SERVING_QUANTITIES' USING ERRCODE='23514'; END IF;
  END IF;
 ELSE
  target:=CASE WHEN TG_OP='DELETE' THEN OLD.version_id ELSE NEW.version_id END;
  -- Lock the parent to serialize child writes with sealing.
  SELECT sealed INTO locked FROM recipe_version WHERE id=target FOR UPDATE;
  IF locked THEN RAISE EXCEPTION 'IMMUTABLE_RECIPE_CONTENT' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.version_id<>NEW.version_id THEN RAISE EXCEPTION 'RECIPE_VERSION_REASSIGNMENT' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER protect_recipe_version BEFORE INSERT OR UPDATE OR DELETE ON recipe_version FOR EACH ROW EXECUTE FUNCTION protect_version_content();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ingredient_line','recipe_step','step_ingredient','serving_option','serving_quantity','serving_step_override','source_evidence'] LOOP
  EXECUTE format('CREATE TRIGGER protect_content BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_version_content()',t);
 END LOOP;
END $$;
CREATE FUNCTION protect_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_REVIEW_EVIDENCE' USING ERRCODE='23514'; END $$;
CREATE TRIGGER protect_content_review BEFORE UPDATE OR DELETE ON content_review FOR EACH ROW EXECUTE FUNCTION protect_review();
CREATE FUNCTION check_published_recipe() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; vid uuid; scope_count integer;
BEGIN
 IF TG_TABLE_NAME='recipe' THEN rid:=NEW.id; ELSE rid:=NEW.recipe_id; END IF;
 SELECT current_published_version_id INTO vid FROM recipe WHERE id=rid;
 IF vid IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM recipe_version v JOIN recipe_lifecycle l ON l.version_id=v.id WHERE v.id=vid AND v.recipe_id=rid AND v.sealed AND v.season='winter' AND l.state='published') THEN RAISE EXCEPTION 'INVALID_CURRENT_RECIPE_VERSION' USING ERRCODE='23514'; END IF;
  SELECT count(DISTINCT scope) INTO scope_count FROM content_review WHERE version_id=vid AND status='approved';
  IF scope_count<>6 OR NOT EXISTS(SELECT 1 FROM source_evidence WHERE version_id=vid) OR EXISTS(SELECT 1 FROM serving_option o LEFT JOIN content_review r ON r.id=o.review_ref WHERE o.version_id=vid AND (r.status IS DISTINCT FROM 'approved' OR r.scope IS DISTINCT FROM 'servings')) THEN RAISE EXCEPTION 'RECIPE_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM recipe_lifecycle WHERE recipe_id=rid AND state='published' AND version_id IS DISTINCT FROM vid) THEN RAISE EXCEPTION 'PUBLISHED_RECIPE_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER recipe_published_pointer AFTER INSERT OR UPDATE ON recipe DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_published_recipe();
CREATE CONSTRAINT TRIGGER lifecycle_published_pointer AFTER INSERT OR UPDATE ON recipe_lifecycle DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_published_recipe();
CREATE FUNCTION check_lifecycle_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.version_id<>OLD.version_id OR NEW.recipe_id<>OLD.recipe_id OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'LIFECYCLE_REVISION_CONFLICT' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lifecycle_revision BEFORE UPDATE ON recipe_lifecycle FOR EACH ROW EXECUTE FUNCTION check_lifecycle_revision();
CREATE TRIGGER lifecycle_no_delete BEFORE DELETE ON recipe_lifecycle FOR EACH ROW EXECUTE FUNCTION protect_review();
CREATE TABLE calendar_period(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),calendar_version text NOT NULL,term_code text NOT NULL,season text NOT NULL CHECK(season IN('spring','summer','autumn','winter')),
 start_date date NOT NULL,end_date date NOT NULL,timezone text NOT NULL DEFAULT 'Asia/Shanghai' CHECK(timezone='Asia/Shanghai'),source_ref text NOT NULL CHECK(length(trim(source_ref))>0),review_ref text NOT NULL CHECK(length(trim(review_ref))>0),
 CHECK(start_date<end_date),UNIQUE(calendar_version,start_date)
);
CREATE FUNCTION check_calendar_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('calendar:'||NEW.calendar_version,0));
 IF EXISTS(SELECT 1 FROM calendar_period p WHERE p.calendar_version=NEW.calendar_version AND p.id<>NEW.id AND daterange(p.start_date,p.end_date,'[)') && daterange(NEW.start_date,NEW.end_date,'[)')) THEN RAISE EXCEPTION 'OVERLAPPING_CALENDAR_PERIOD' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM hou_content h WHERE h.period_id=NEW.id AND (NEW.season<>'winter' OR h.start_date<NEW.start_date OR h.end_date>NEW.end_date)) THEN RAISE EXCEPTION 'INVALID_EXISTING_HOU_INTERVAL' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER calendar_nonoverlap BEFORE INSERT OR UPDATE ON calendar_period FOR EACH ROW EXECUTE FUNCTION check_calendar_overlap();
CREATE TABLE hou_content(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),period_id uuid NOT NULL REFERENCES calendar_period(id),start_date date NOT NULL,end_date date NOT NULL,
 name text NOT NULL CHECK(length(trim(name))>0),text text NOT NULL,source_ref text NOT NULL,review_ref text,status text NOT NULL CHECK(status IN('pending','approved')),
 CHECK(start_date<end_date),CHECK(status<>'approved' OR (review_ref IS NOT NULL AND length(trim(review_ref))>0 AND length(trim(source_ref))>0))
);
CREATE FUNCTION check_hou_interval() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p calendar_period;
BEGIN
 SELECT * INTO p FROM calendar_period WHERE id=NEW.period_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HOU_PERIOD_NOT_FOUND' USING ERRCODE='23503'; END IF;
 IF p.season<>'winter' OR NEW.start_date<p.start_date OR NEW.end_date>p.end_date THEN RAISE EXCEPTION 'INVALID_HOU_INTERVAL' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM hou_content h WHERE h.period_id=NEW.period_id AND h.id<>NEW.id AND daterange(h.start_date,h.end_date,'[)') && daterange(NEW.start_date,NEW.end_date,'[)')) THEN RAISE EXCEPTION 'OVERLAPPING_HOU_INTERVAL' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hou_interval BEFORE INSERT OR UPDATE ON hou_content FOR EACH ROW EXECUTE FUNCTION check_hou_interval();
