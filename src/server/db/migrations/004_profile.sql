CREATE TABLE profile_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('safety', 'preferences', 'ai')),
  notice_version text NOT NULL CHECK (length(btrim(notice_version)) > 0),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz CHECK (revoked_at >= accepted_at),
  UNIQUE (id, account_id, purpose)
);

CREATE UNIQUE INDEX profile_consent_one_active
  ON profile_consent (account_id, purpose)
  WHERE revoked_at IS NULL;

CREATE TABLE profile_section (
  account_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('safety', 'preferences', 'equipment')),
  state text NOT NULL CHECK (state IN ('unknown', 'explicit_none', 'provided')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  consent_id uuid,
  revision integer NOT NULL CHECK (revision > 0),
  deletion_generation integer NOT NULL DEFAULT 0 CHECK (deletion_generation >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, section),
  FOREIGN KEY (consent_id, account_id, section) REFERENCES profile_consent (id, account_id, purpose),
  CHECK (section <> 'equipment' OR consent_id IS NULL),
  CHECK (state <> 'unknown' OR (payload = '{}'::jsonb AND consent_id IS NULL)),
  CHECK (state <> 'provided' OR payload <> '{}'::jsonb),
  CHECK (section = 'equipment' OR state = 'unknown' OR consent_id IS NOT NULL)
);

-- Payload validation and dictionary resolution belong to the profile service.
-- Reads must honor consent.revoked_at. The FK preserves the original consent
-- reference without making a revoked consent usable for recommendations.
