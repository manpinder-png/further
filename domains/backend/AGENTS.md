# Domain instructions

Backend owns identity, validation, authorization, safe errors, idempotency and persistence. Never trust client actor IDs, scores, room history or facilitator context. Use signed loopback-only local identities; this is not production auth. Authorize membership before inference. Replayed requests must not repeat paid calls or progress. Shared facilitator receives only participant-approved shared content.
