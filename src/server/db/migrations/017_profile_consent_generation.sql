ALTER TABLE profile_consent ADD COLUMN deletion_generation integer NOT NULL DEFAULT 0 CHECK (deletion_generation >= 0);

UPDATE profile_consent AS consent SET deletion_generation=section.deletion_generation
FROM profile_section AS section
WHERE consent.id=section.consent_id AND consent.account_id=section.account_id;
