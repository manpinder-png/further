-- Rebuildable indexing work is committed with concept/profile mutations. One
-- row per current source and embedding space bounds repeated-edit growth.
CREATE TABLE IF NOT EXISTS retrieval_index_jobs (
  id uuid PRIMARY KEY,
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK(entity_type IN ('concept','intent','resource_chunk','metadata')),
  entity_id text NOT NULL,
  text_content text NOT NULL,
  content_hash text NOT NULL,
  model text NOT NULL,
  model_revision text NOT NULL,
  generation bigint NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','retry','ready')),
  attempts integer NOT NULL DEFAULT 0,
  not_before bigint NOT NULL DEFAULT 0,
  lease_token uuid,
  lease_expires_at bigint,
  last_error text,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  UNIQUE(learner_id,entity_type,entity_id,model,model_revision)
);
CREATE INDEX IF NOT EXISTS retrieval_jobs_claim ON retrieval_index_jobs(learner_id,model,model_revision,status,not_before);
