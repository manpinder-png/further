# Data domain

- Own relational facts, event history and retrieval indexes through `FurtherRepository`; callers must not send SQL or choose another learner's identity from model output.
- The backend constructs `actorId` from its local session. Repository methods are a trusted server boundary, not independently authenticated HTTP endpoints.
- Local storage uses PGlite (embedded PostgreSQL) and pgvector. One application process owns one data directory. Do not point two processes at the same files.
- Keep `.local/` data, media, lock files and downloaded model weights out of Git.
- Knowledge history is authoritative; embeddings are rebuildable derived indexes. Never merge concepts or change identity solely because of vector similarity.
- Keep provider/model/revision/content-hash provenance with vectors and inferred metadata. Never compare different embedding spaces.
- Peer candidates expose only the opted-in projection, not private profile background, raw intent, metadata or media. Apply eligibility and blocks before ranking.
- Treat invitations, mutual acceptance, room creation and completion as transactional operations. Preserve exact invitation-to-session linkage and idempotency.
- `lib/math.ts` is the shared progress calculation. Do not recreate its formulas in SQL. Progress is an application heuristic, not a claim of verified knowledge.
- Run `tests/data-repository.test.ts` after persistence, authorization, invitation, event or vector changes. Add migrations for later schema versions rather than mutating an applied schema silently.
- No commits, pushes or cloud database changes during the current local development authorization.
