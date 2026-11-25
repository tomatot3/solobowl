CREATE TABLE content_import_batch (
  source_hash text PRIMARY KEY CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  source jsonb NOT NULL,
  report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE content_draft (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL,
  raw_version text NOT NULL,
  internal_revision integer NOT NULL CHECK(internal_revision>0),
  source_hash text NOT NULL REFERENCES content_import_batch(source_hash),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  review_state text NOT NULL DEFAULT 'pending' CHECK(review_state IN ('pending','isolated')),
  draft jsonb NOT NULL,
  UNIQUE(source_id,raw_version,content_hash),
  UNIQUE(source_id,internal_revision)
);
