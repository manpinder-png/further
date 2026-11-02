# Further local development

Read README.md, docs/ONBOARDING.md, docs/HANDOFF.md and docs/CODE_MAP.md first, then the relevant domain instructions before edits. docs/ARCHITECTURE.md gives the system diagram. The latest Connor/Sirpreet map-first implementation is the baseline. Existing docs/DESIGN.md is historical context, not an override of the current local architecture.

## Current user constraints

- The user authorized the v1 snapshot commit/push to feature/v1. Preserve that snapshot. The rejected v2 source is backed up locally. The v2 handoff is authorized on further-final feature/v2 and further feature/mani-v2. Colleagues may continue development on feature/mani-v2. Preserve feature/v1; use PRs for any main-branch merge. The November 2 user instruction now authorizes the AWS data/auth deployment described below.
- The ordinary integration repository is further-final. The user explicitly authorized further feature/mani-v2 as the v2 team handoff branch; this supersedes the earlier reference-only rule for that branch. Do not publish unrelated branches or merge main without authorization.
- Product inference uses approved standard Meta models through direct Meta API or the exact Baseten hackathon model. No Contributor models, OpenAI inference, tracing exports or unrequested providers.
- Use current official Meta and provider documentation before changing capabilities or API payloads. Core OpenAI SDK is an integration library, not an inference provider.
- Preserve v1’s overall layout: collapsible journey on the left, radial knowledge map in the centre, concept inspector on the right, and the bottom composer. The user explicitly rejected the v2 replacement layout on November 1. Simplification must be subtle and stay within these established surfaces; do not redefine the product navigation or composition without an explicit request. Current-question focus and an All topics option can clarify the existing canvas. Keep persona-labelled live activity such as “Path guide · Model connection established”.
- Google OAuth is parked at the user’s request. Preserve the dormant implementation, but do not pursue setup or show an unconfigured-sign-in nag. Local accounts remain supported.
- The cumulative knowledge map must remain directly accessible across all saved questions. Geomind means conceptual neighborhoods, not physical coordinates: shared ideas and complementary learning evidence help willing people discover each other. Keep the question, personal history and community views within the v1 map workspace. Current matching consent permits available-now discovery only; persistent/offline sharing and optional coarse geography require their own explicit choices. Never expose an entire private map through discovery or imply measured scale.
- My knowledge map starts with summarized topics, not a flat union of saved question paths. Clicking a topic drills into its original member concepts; breadcrumbs and zoom-out return to the overview. Summary groups are a private derived presentation across questions, retain canonical concept IDs and learning evidence, and never become matching identities or imply mastery. Use real Meta inference for semantic grouping with exact membership validation and source-hash caching; no hardcoded topic aliases or fabricated taxonomy.
- The November 2 user instruction authorizes AWS CloudFormation deployment for Aurora PostgreSQL Serverless/pgvector, Cognito email/password authentication with optional Facebook federation, and private S3 media. UI, APIs and agents remain local. PGlite remains available for isolated local tests/demos. Cloud API hosting, Supabase integration and physical geography remain parked. Preserve the feature/v1 snapshot; the v2 snapshot commit and the two named branch pushes are authorized. Peer guide, Geomind and matching share versioned vector retrieval plus deterministic eligibility/ranking. Never silently fall back to keyword overlap or treat raw cosine as confidence.
- Knowledge navigation supports repeated topic/subtopic drill-down, canonical parent-child relationships and breadcrumbs, with bounded model calls and progressively rendered branches. Geomind uses a pannable community-map surface; distance from the viewer reflects semantic similarity while bearing is illustrative.
- Every learner-facing AI flow streams real provider output when supported and shows safe operational activity: current agent, delegation, tool use, validation and saving. Explain waiting states and offer cancellation/retry. Never simulate token streaming or show private reasoning, prompts, raw tool arguments or secrets.
- Never publish parent notes, account details, credentials, provider keys, local databases, media or logs.

## Domain boundaries

- UI: components/, lib/client/, app pages, domains/ui/. Only HTTP and public contracts; no database driver/provider client imports.
- Backend: app/api/, domains/backend/. Trusted identity, validation, use cases, persistence authority and idempotency.
- Agents: domains/agents/. Independent typed contracts, bounded delegation and provider adapters; repository access only through explicit tool ports.
- Data: domains/data/. Authoritative schema, private learner overlay, consented peer projection and one repository interface.
- Retrieval: domains/retrieval/. Local Meta encoder, versioned derived indexes. Embeddings never authorize access or establish mastery.

## Synchronization and validation

Assign non-overlapping file ownership when using parallel agents. Agree contract changes first. Shared progress logic stays in lib/math.ts; shared matching in lib/matching.ts. Changes to data methods require restarting the local dev server because the repository is cached for HMR.

Run npm run check and npm run build for integrated changes, sequentially: the build regenerates .next/types consumed by the type check. Run the separate HTTP tests against an isolated fixture database. Test actual provider compatibility with small synthetic inputs when provider adapters change. Report live, fixture and unverified capabilities distinctly.

Update docs/ARCHITECTURE.md and relevant domain docs whenever behavior changes; run npm run map to regenerate the source dependency inventory. The /architecture page draws from the same agent registry and health endpoint as the app.

Learner-facing copy uses plain language. Safe agent activity is visible in the experience; low-level diagnostics belong in the architecture page or builder console. Streamed drafts are provisional until validated and saved. Missing keys and failed saves are visible errors, never synthetic successes. Explicit sample mode may show labelled fixture content and must not persist fixture grades as understanding.
