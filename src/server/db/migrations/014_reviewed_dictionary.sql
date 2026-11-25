CREATE TABLE reviewed_dictionary (
  kind text NOT NULL CHECK(kind IN ('avoidances','allergies','professionalRestrictions','equipment','flavor')),
  canonical_id text NOT NULL CHECK(length(canonical_id) BETWEEN 1 AND 100),
  label text NOT NULL CHECK(length(trim(label))>0),
  source_ref text NOT NULL CHECK(length(trim(source_ref))>0),
  review_ref text NOT NULL CHECK(length(trim(review_ref))>0),
  approved_at timestamptz NOT NULL,
  PRIMARY KEY(kind,canonical_id)
);
CREATE TABLE calendar_active (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  calendar_version text NOT NULL
);
