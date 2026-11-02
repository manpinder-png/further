-- Local-first schema v1. Standard PostgreSQL SQL + pgvector; no Supabase services.
-- Millisecond timestamps are UTC epoch values shared with the existing event UI.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at bigint NOT NULL);

CREATE TABLE IF NOT EXISTS learners (
  id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  static_profile jsonb NOT NULL DEFAULT '{"role":"","background":"","age18Plus":false}',
  preferences jsonb NOT NULL DEFAULT '{"style":"","pace":"","inferred":false}',
  current_intent text NOT NULL DEFAULT '',
  open_to_match boolean NOT NULL DEFAULT false,
  language text NOT NULL DEFAULT 'en',
  available_minutes integer NOT NULL DEFAULT 15 CHECK (available_minutes BETWEEN 1 AND 240),
  revision integer NOT NULL DEFAULT 1,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS profile_revisions (
  id uuid PRIMARY KEY, learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  revision integer NOT NULL, patch jsonb NOT NULL, created_at bigint NOT NULL,
  UNIQUE(learner_id,revision)
);
CREATE TABLE IF NOT EXISTS concepts (
  slug text PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  title text NOT NULL, hook text NOT NULL DEFAULT '', summary text,
  domain text NOT NULL DEFAULT 'general', difficulty double precision,
  cover_url text, created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS concept_edges (
  src text NOT NULL REFERENCES concepts(slug) ON DELETE CASCADE,
  dst text NOT NULL REFERENCES concepts(slug) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('prerequisite','related','part_of')),
  CHECK(src <> dst), PRIMARY KEY(src,dst,kind)
);
CREATE TABLE IF NOT EXISTS learner_concepts (
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  concept_slug text NOT NULL REFERENCES concepts(slug) ON DELETE CASCADE,
  created_at bigint NOT NULL, PRIMARY KEY(learner_id,concept_slug)
);
CREATE TABLE IF NOT EXISTS learning_events (
  id bigserial PRIMARY KEY,
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  concept_slug text NOT NULL REFERENCES concepts(slug),
  kind text NOT NULL CHECK(kind IN ('seed','open','dwell','skip','watch','explain','session')),
  payload jsonb NOT NULL DEFAULT '{}', idempotency_key text NOT NULL,
  occurred_at bigint NOT NULL, UNIQUE(learner_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS learning_events_user_time ON learning_events(learner_id,occurred_at,id);
CREATE TABLE IF NOT EXISTS inferred_metadata (
  id uuid PRIMARY KEY, learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  kind text NOT NULL, values_json jsonb NOT NULL, provenance jsonb NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS metadata_user_time ON inferred_metadata(learner_id,created_at DESC);
CREATE TABLE IF NOT EXISTS presence (
  learner_id uuid PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE,
  last_seen bigint NOT NULL, expires_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY, from_user uuid NOT NULL REFERENCES learners(id),
  to_user uuid NOT NULL REFERENCES learners(id), CHECK(from_user <> to_user),
  pair_key text NOT NULL, concept_slug text NOT NULL REFERENCES concepts(slug),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','expired')),
  accepted_by uuid[] NOT NULL DEFAULT '{}',
  reason text NOT NULL DEFAULT '', score double precision NOT NULL DEFAULT 0,
  context jsonb NOT NULL DEFAULT '{}', created_at bigint NOT NULL,
  expires_at bigint NOT NULL, session_id uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_invitation_per_pair ON invitations(pair_key) WHERE status='pending';
CREATE INDEX IF NOT EXISTS invitation_inbox ON invitations(to_user,created_at DESC);
CREATE TABLE IF NOT EXISTS learning_sessions (
  id uuid PRIMARY KEY,
  invitation_id uuid UNIQUE NOT NULL REFERENCES invitations(id),
  concept_slug text NOT NULL REFERENCES concepts(slug),
  context jsonb NOT NULL DEFAULT '{}', summary jsonb NOT NULL DEFAULT '[]',
  created_at bigint NOT NULL, ended_at bigint
);
CREATE TABLE IF NOT EXISTS session_members (
  session_id uuid NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
  learner_id uuid NOT NULL REFERENCES learners(id),
  PRIMARY KEY(session_id,learner_id)
);
CREATE TABLE IF NOT EXISTS session_messages (
  id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
  author_id uuid REFERENCES learners(id),
  kind text NOT NULL CHECK(kind IN ('human','facilitator','system')),
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 12000),
  provenance jsonb, idempotency_key text NOT NULL,
  submitted_by uuid NOT NULL REFERENCES learners(id), created_at bigint NOT NULL,
  UNIQUE(session_id,submitted_by,idempotency_key)
);
CREATE INDEX IF NOT EXISTS messages_session_time ON session_messages(session_id,created_at,id);
CREATE TABLE IF NOT EXISTS blocks (
  blocker uuid NOT NULL REFERENCES learners(id), blocked uuid NOT NULL REFERENCES learners(id),
  CHECK(blocker <> blocked), created_at bigint NOT NULL, PRIMARY KEY(blocker,blocked)
);
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY, reporter uuid NOT NULL REFERENCES learners(id),
  reported uuid NOT NULL REFERENCES learners(id), session_id uuid REFERENCES learning_sessions(id),
  reason text NOT NULL, created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY, learner_id uuid NOT NULL REFERENCES learners(id),
  agent_id text NOT NULL, parent_run_id uuid REFERENCES agent_runs(id),
  status text NOT NULL CHECK(status IN ('running','succeeded','failed')),
  input_json jsonb NOT NULL, output_json jsonb, model text, provider text, error text,
  created_at bigint NOT NULL, finished_at bigint
);
CREATE INDEX IF NOT EXISTS runs_user_time ON agent_runs(learner_id,created_at DESC);
CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY, learner_id uuid NOT NULL REFERENCES learners(id),
  kind text NOT NULL CHECK(kind IN ('image','audio','document')),
  mime_type text NOT NULL, local_path text NOT NULL, content_hash text NOT NULL,
  byte_size bigint NOT NULL CHECK(byte_size >= 0), extracted_text text,
  provenance jsonb, created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS retrieval_vectors (
  id uuid PRIMARY KEY, learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK(entity_type IN ('concept','intent','resource_chunk','metadata')),
  entity_id text NOT NULL, text_content text NOT NULL,
  embedding vector(768) NOT NULL, model text NOT NULL, model_revision text NOT NULL,
  dimensions integer NOT NULL CHECK(dimensions=768), content_hash text NOT NULL,
  mode text NOT NULL CHECK(mode='local-meta'), created_at bigint NOT NULL,
  UNIQUE(learner_id,entity_type,entity_id,model,model_revision)
);
CREATE INDEX IF NOT EXISTS vectors_actor_model ON retrieval_vectors(learner_id,model,model_revision);
-- Exact cosine search is deliberate for the small local corpus. Add an HNSW
-- index only after retrieval recall/latency measurements, preserving partitions.
