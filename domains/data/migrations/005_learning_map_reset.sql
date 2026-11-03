CREATE TABLE IF NOT EXISTS learning_map_resets (
  learner_id uuid NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  created_at bigint NOT NULL,
  PRIMARY KEY(learner_id, idempotency_key)
);
