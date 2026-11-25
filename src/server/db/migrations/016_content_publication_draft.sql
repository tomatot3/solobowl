ALTER TABLE content_draft
  ADD COLUMN published_version_id uuid UNIQUE REFERENCES recipe_version(id);
