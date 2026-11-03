CREATE INDEX IF NOT EXISTS learning_events_explanation_topic
  ON learning_events(concept_slug, learner_id) WHERE kind = 'explain';
