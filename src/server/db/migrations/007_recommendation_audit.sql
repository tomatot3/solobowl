CREATE TABLE recommendation_run (
  run_id uuid PRIMARY KEY,
  rule_version text NOT NULL,
  mode text NOT NULL CHECK(mode IN ('A','B','C')),
  calendar_version text,
  candidate_versions uuid[] NOT NULL CHECK(cardinality(candidate_versions)<=3),
  ai_status text NOT NULL,
  fallback_code text,
  calls integer NOT NULL CHECK(calls BETWEEN 0 AND 3),
  elapsed_ms integer NOT NULL CHECK(elapsed_ms>=0),
  created_at timestamptz NOT NULL DEFAULT now()
);
