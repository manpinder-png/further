# Further local development

Read README.md, docs/ARCHITECTURE.md and the relevant domain instructions before edits. The latest Connor/Sirpreet map-first implementation is the baseline. Existing docs/DESIGN.md is historical context, not an override of the current local architecture.

## Current user constraints

- Work locally on feature/agentic-local in further-final. No commits, pushes, merges or cloud deployment until the user changes this instruction.
- Team repository further is reference-only. Future integration belongs on a feature branch in further-final before any merge.
- Product inference uses approved standard Meta models through direct Meta API or the exact Baseten hackathon model. No Contributor models, OpenAI inference, tracing exports or unrequested providers.
- Use current official Meta and provider documentation before changing capabilities or API payloads. Core OpenAI SDK is an integration library, not an inference provider.
- Preserve the iteration-nov1 UI direction while improving real saved state. AI supports personal understanding and facilitates human collaboration.
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

Run npm run check and npm run build for integrated changes. Run the separate HTTP tests against an isolated fixture database. Test actual provider compatibility with small synthetic inputs when provider adapters change. Report live, fixture and unverified capabilities distinctly.

Update docs/ARCHITECTURE.md and relevant domain docs whenever behavior changes; run npm run map to regenerate the source dependency inventory. The /architecture page draws from the same agent registry and health endpoint as the app.

Learner-facing copy uses plain language. Safe agent activity is visible in the experience; low-level diagnostics belong in the architecture page or builder console. Streamed drafts are provisional until validated and saved. Missing keys and failed saves are visible errors, never synthetic successes. Explicit sample mode may show labelled fixture content and must not persist fixture grades as understanding.
