-- Only the current Beijing business date is accessible; raw old text is removed
-- on access. Sync registration and deletion barriers are added by US2.
CREATE TABLE today_state(
 account_id uuid PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 business_date date NOT NULL,text text NOT NULL CHECK(length(text)<=2000),
 revision integer NOT NULL CHECK(revision>0),expires_on_date date NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),CHECK(expires_on_date=business_date+1)
);
