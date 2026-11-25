CREATE TABLE shopping_workspace (
  account_id uuid PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  shopping jsonb NOT NULL
);
