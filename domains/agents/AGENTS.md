# Agent domain

- Own independent agent contracts, prompts, bounded execution, provider adapters and agent tests.
- Import no UI, route handlers or concrete database implementation. Read data through injected actor-scoped ports.
- Model output is a proposal. Authentication, authorization, durable idempotency and writes belong to backend/data domains.
- Every specialist is independently invocable through the same versioned runtime contract. Internal delegation preserves actor, correlation, cancellation and the shared budget.
- Only standard Meta models through the approved Meta/Baseten endpoints may receive learner data. Never default to OpenAI inference or enable Contributor variants.
- Never log keys, raw prompts, private reasoning or encrypted reasoning payloads. Trace only action metadata and token counts.
- Consult current official provider documentation before modifying SDK, tool, multimodal or reasoning behavior. Preserve Meta Responses encrypted reasoning items intact within a run and use `store: false`.
- Explicit fixture mode is a rehearsal, not a fallback. Provider failures remain visible failures.
- Do not claim A2A compliance: the current transport-independent invocation contract has an HTTP adapter; A2A/MCP can be future adapters.
- No commits or pushes are authorized for the current local build.
