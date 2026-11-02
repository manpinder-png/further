# Code map — v2 handoff

Use this with [architecture](ARCHITECTURE.md) and [onboarding](ONBOARDING.md). Paths below are repository-relative. The import graph is machine-readable in [dependency-map.json](dependency-map.json); regenerate it with `npm run map`. It describes imports, including type-only edges, rather than runtime execution order.

## UI → API → domain → storage

All protected routes resolve the actor server-side through `domains/backend/identity.ts`. JSON schemas, origin checks and retry keys are backend concerns; model output supplies no authority.

| UI section / entry | HTTP route(s) | Main implementation | Reads / writes; model |
|---|---|---|---|
| Sign up / sign in / account | `/api/auth/{signup,confirm,resend,login,logout,session,account}`; `/api/auth/cognito/{start,callback}` | `components/auth/`; `domains/backend/{auth,cognito-auth,cognito-oauth}.ts`; `domains/data/auth-store.ts` | Cognito identity in AWS mode; `accounts`, `account_identities`, `account_sessions`, OAuth transactions/attempts; no model |
| Profile / availability | `/api/data/profile`; `/api/local/presence` | `app/profile/page.tsx`; repository `updateProfile`, `heartbeat` | `learners`, `profile_revisions`, `presence`; changed search inputs queue indexing; no model |
| Initial load / saved questions / timeline | `/api/data/bootstrap`; `/api/data/events` | `lib/client/store.tsx`, `learning-paths.ts`; repository snapshot/event methods; `lib/math.ts` | Owner concepts/events, profile, saved `agent_runs`, current invitations/room; no model on bootstrap |
| Dock question / “This question” | `/api/expand` | `CommandBar.tsx`; `domains/backend/agents.ts` → `invokeAgent`; `domains/agents/runtime.ts` | Reads owner map; writes concepts/edges, membership/seed evidence, metadata, run and index jobs; knowledge-map + optional delegated specialists |
| “My knowledge map” / topic drill-in | `/api/knowledge/overview` GET/POST; `/api/knowledge/overview/read` POST | `use-knowledge-overview.ts`; `domains/backend/knowledge-overview.ts`; `lib/{knowledge-overview,knowledge-hierarchy}.ts`; `KnowledgeMap.tsx` | Owner graph → derived, validated `agent_runs` caches; knowledge-map `summarize`; read endpoint performs no inference/write |
| “Geomind” / person inspector | `/api/geomind`; `/api/geomind/invite` | `GeomindMap.tsx`, `GeomindInspector.tsx`, `use-geomind.ts`; backend `geomindNeighborhood`, `inviteGeomindNeighbor`; `lib/geomind-layout.ts` | Consented active topics/vectors + current eligibility; explicit invite writes `invitations`; deterministic |
| Peer action / match dialog | `/api/match`; `/api/inbox` | `MatchModal.tsx`; backend `social.ts`: `rankedPeers`, `suggestMatch`, `createSemanticInvitation` | Same `semanticPeerSearch` as Geomind; `retrieval_vectors`, learner/presence/block/session eligibility, invitations; deterministic |
| Inspector: Learn / course / Explain | `/api/teach`; `/api/course`; `/api/explain` | `components/learn/Teach.tsx`, `mission/Inspector.tsx`; `invokeAgent` | Owner learning context, `agent_runs`; explain-back writes attributed `learning_events`; learning-companion (`solo`, course presentation, `explain-back`) |
| Inspector: Sources | `/api/card/{slug}`; `/api/resources/verify` | `Inspector.tsx`; resource-guide; `domains/backend/source-verification.ts` | Owner concept/run context, provider citations and checked URLs; resource-guide Meta search; source viewing can record a watch event |
| Image / microphone input | `/api/media/understand`; `/api/media/{id}`; `/api/transcribe` | `CommandBar.tsx`; `domains/backend/media-storage.ts`; agent `openai-provider.ts`, `audio.ts`, `transcription-stream.ts` | Images: owner `media_assets` + local/S3 blob, perception/run provenance; audio: Meta transcription returns text, no raw-audio persistence; learner confirms proposed question |
| Shared room | `/api/session/{id}/message` GET/POST; `/api/session/{id}/end`; `/api/local/sessions/{id}` and `/block`, `/report` | `app/session/page.tsx`; backend `roomView`; repository room methods | Membership checks; human message saved before facilitation; room-only context to learning-companion; sessions/messages, blocks/reports, idempotent participation events |
| Progress / index readiness | SSE on AI routes; `/api/local/indexing`; `/api/local/reindex`; `/api/local/search` | `ActivityPanel.tsx`, `IndexingStatus.tsx`; `streaming.ts`; retrieval `client.ts` | Safe live events; owner index jobs/vectors; local Meta encoder for changed text or query |
| Architecture view / health | `/architecture`; `/api/health`; `/api/agents` | `ArchitectureExplorer.tsx`; `lib/server/config.ts`; agent registry | Safe config/encoder health, schemas and run summaries; no inference. `mode: local` describes app hosting, not database location |

## Contracts and domain entry points

| Change area | Contract / entry point | Focused checks |
|---|---|---|
| UI state and streaming | `domains/ui/contracts.ts`; `lib/client/store.tsx`, `live.ts`, `stream.ts`, `narration.ts`; `lib/types.ts` | `ui-stream`, `ui-learning-paths`, `ui-lesson-state`, `progress-guidance` tests |
| Agent input/output and orchestration | `domains/agents/contracts.ts`; `runtime.ts`; backend `agents.ts` | `agents`, `agents-routes`, `agents-retry`, `agents-evidence` tests |
| Provider transport and speech | `domains/agents/{openai-provider,provider-streams,audio,transcription-stream}.ts` | Provider/stream/audio tests; live provider checks separately |
| Repository and database adapter | `domains/data/contracts.ts`; `repository.ts`; `sql.ts`; `aurora-data-api.ts` | `data-repository`, `aurora-data-api`, backend HTTP tests |
| Account authority / federation | Backend `identity.ts`, `auth.ts`, `cognito-auth.ts`, `cognito-oauth.ts`; data `auth-contracts.ts` | `auth`, `cognito-auth`, owner-isolation HTTP tests |
| Knowledge hierarchy | Backend `knowledge-overview.ts`; `lib/knowledge-hierarchy.ts`, `knowledge-overview.ts`, `graph-layout.ts` | `knowledge-overview*`, `knowledge-hierarchy*` tests |
| Semantic matching | Backend `social.ts`, `geomind.ts`; `lib/matching.ts`; retrieval `projection.ts` | `semantic-matching`, `matching-scope`, `geomind*` tests |
| Embedding space / durable jobs | Retrieval `space.ts`, `reference-mean.json`, `client.ts`, `embedding_service.py` | `semantic-indexing` tests; `evaluate.py` with held-out fixtures |
| Image storage / URL verification | Backend `media-storage.ts`, `source-verification.ts` | `media-storage`, `media-routes`, `source-verification` tests |
| AWS resource definitions | `infra/aws/create-template.py` → `further-dev.json`; `scripts/configure-aws.py` | `infra/aws/validate.py`; live acceptance in [AWS guide](AWS_DEPLOYMENT.md) |

Test labels refer to matching filenames in `tests/`. Detailed ownership rules live in each domain's `AGENTS.md`.

## Schema and storage entry points

| Ordered migration | Responsibility |
|---|---|
| `domains/data/migrations/001_local.sql` | Shared concepts/edges, personal overlay/events, metadata, presence/invitations/rooms, blocks/reports, runs, media references and `vector(768)` |
| `002_accounts.sql` | Accounts, usernames, provider subjects, revocable hashed sessions, OAuth state and rate limits |
| `003_semantic.sql` | Durable, deduplicated per-source/per-space index jobs, generation leases and retry state |
| `004_cognito.sql` | Cognito provider constraints; federated accounts have no local password hash |

Migrations run through the shared SQL abstraction in both database modes; append a new migration for future changes. `getRepository()` chooses PGlite or Aurora Data API. Media storage chooses local files or S3 separately. Local/cloud configuration and downloaded models stay ignored; there are no credential values or database copies in the handoff.

## Agent and stream contracts

`GET /api/agents` returns the six agent cards and JSON input/output schemas. Either invocation form uses authenticated same-origin access:

```text
POST /api/agents/{agentId}  {"input": {...}, "idempotencyKey": "stable-attempt-key"}
POST /api/agents/invoke    {"agentId": "metadata", "input": {...}, "idempotencyKey": "stable-attempt-key"}
Accept: text/event-stream
```

Routes validate input before `withProgress`. `invokeAgent` owns durable run/idempotency handling and injects actor-scoped tools into `AgentRuntime`. Internal child calls share actor, correlation, cancellation and budget; child artifacts/traces live in the top-level result rather than requiring one durable run row per delegation. Without the SSE accept header, the route returns the final JSON result.

| SSE message | Client meaning |
|---|---|
| `activity` with `agentId`, `phase`, `label` | Real accepted/work/tool/delegation/save state; persona label comes from `lib/client/narration.ts` |
| `text_delta` with `field`, `delta`, optional `replace` | Provisional public answer text; not yet a saved fact or evidence |
| `result` with validated `result` | Final result; persistence flags/state distinguish a saved action from rehearsal |
| `error` with safe `error` and optional code | Explicit failure/retry; provider bodies and private reasoning are excluded |
| `: keepalive` comment | Connection liveness only; not displayed as progress |

The retired `/api/mcp` returns HTTP 410. No MCP/A2A interoperability or external trace exporter is implemented. Fixtures require explicit rehearsal mode; provider errors do not select them.

For deeper behavior use [agent protocol](agents/PROTOCOL.md), [data](data/README.md), [retrieval](retrieval/README.md), [UI](ui/README.md), [authentication](AUTHENTICATION.md), [media](MEDIA_STORAGE.md) and [Geomind](GEOMIND.md).
