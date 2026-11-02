# Data domain

- Own relational facts, event history and retrieval indexes through `FurtherRepository`; callers must not send SQL or choose another learner's identity from model output.
- The backend constructs `actorId` from its verified session. Repository methods are a trusted server boundary, not independently authenticated HTTP endpoints.
- Local storage uses PGlite (embedded PostgreSQL) and pgvector. One application process owns one data directory. Do not point two processes at the same files.
- Keep `.local/` data, media, lock files and downloaded model weights out of Git.
- Knowledge history is authoritative; embeddings are rebuildable derived indexes. Never merge concepts or change identity solely because of vector similarity.
- Keep provider/model/revision/content-hash provenance with vectors and inferred metadata. Never compare different embedding spaces.
- Peer candidates expose only the opted-in projection, not private profile background, raw intent, metadata or media. Apply eligibility and blocks before ranking.
- Treat invitations, mutual acceptance, room creation and completion as transactional operations. Preserve exact invitation-to-session linkage and idempotency.
- `lib/math.ts` is the shared progress calculation. Do not recreate its formulas in SQL. Progress is an application heuristic, not a claim of verified knowledge.
- Run `tests/data-repository.test.ts` after persistence, authorization, invitation, event or vector changes. Add migrations for later schema versions rather than mutating an applied schema silently.
- AWS development data deployment is explicitly authorized. Keep UI/API/agent compute local and preserve PGlite fixtures. The current v2 handoff authorizes the two named feature-branch pushes in root AGENTS.md; later publication still needs user direction.
- Real accounts, provider identities, hashed sessions and one-use OAuth transactions use migration 002. Never silently attach an old synthetic learner to a new account. Auth persistence shares the one PGlite instance. Public snapshots may include only the display names of the learner's own session peers, never a directory of accounts.
- Aurora mode uses the same migrations through the Data API SqlDatabase adapter. Pass the RDS-managed secret ARN, never retrieve its password. Cognito identities use migration 004; never migrate local password hashes into Cognito. Keep data operations owner-scoped and derived vector spaces versioned.
