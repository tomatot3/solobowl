ALTER TABLE "user" ADD COLUMN username text UNIQUE;

ALTER TABLE "user" ADD CONSTRAINT user_username_identity CHECK (
  username IS NULL OR (
    username ~ '^[a-z0-9_]{3,24}$'
    AND email = username || '@login.shiyoushu.invalid'
    AND NOT "emailVerified"
  )
);
