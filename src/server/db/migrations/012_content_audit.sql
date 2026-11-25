CREATE TABLE content_release_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES recipe_version(id),
  before_state text NOT NULL,
  after_state text NOT NULL,
  operator_ref text NOT NULL CHECK(length(trim(operator_ref))>0),
  review_ref text NOT NULL CHECK(length(trim(review_ref))>0),
  created_at timestamptz NOT NULL DEFAULT now()
);
