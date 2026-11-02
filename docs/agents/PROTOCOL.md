# Agent invocation contract v1.0

The internal protocol is a typed capability contract, not a claim of A2A conformance. The same registry can be called in-process or through an authenticated HTTP adapter. MCP and A2A can be added as adapters when a verified client needs them; neither should become the data model or force agents into separate services prematurely.

## Invocation

```ts
const result = await runtime.invoke(
  "knowledge-map",
  { text: "How does GPU memory affect training?", objective: "expand" },
  {
    actorId: verifiedSession.userId,
    correlationId: requestCorrelationId,
    signal: request.signal,
    budget: { maxModelCalls: 8, maxToolCalls: 10, timeoutMs: 180_000 },
  },
);
```

Do not take `actorId` from a model output or an unauthenticated request. The HTTP adapter derives it from the application's session. `idempotencyKey` is carried in context for application integration; durable request de-duplication must happen at the backend/data boundary. This runtime performs no writes and does not promise distributed exactly-once execution.

The local HTTP adapter exposes `GET /api/agents` for discovery and `POST /api/agents/:agentId` with `{ "input": { ... } }`. `POST /api/agents/invoke` is an alias with `{ "agentId": "metadata", "input": { ... } }`. Use the `idempotency-key` header for retryable requests. These routes use a signed local identity cookie and loopback origin checks; they are not production identity or an A2A endpoint. `x-further-demo: true` selects explicit rehearsal output; missing keys or provider errors never activate that mode.

Existing UI adapters use the same runtime:

| Route | Specialist / behavior |
| --- | --- |
| `POST /api/teach` | `learning-companion`, solo teaching moment; authoritative learner context comes from the backend |
| `POST /api/course` | `learning-companion`, `presentation: course`; 3–5 validated short lessons |
| `GET /api/card/:slug` | `resource-guide`; requires actual search and citation annotations in live mode; an annotation is not a successful HTTP reachability check |
| `POST /api/explain` | `learning-companion`, explain-back; integer 0–3 feedback rubric, persisted once under the agent run ID; response `persisted: true` prevents duplicate browser events |
| `POST /api/transcribe` | Separate Meta ASR capability; authenticated multipart WAV upload, maximum 60 seconds; fixture text is explicitly labelled and does not interpret the recording |

The legacy lesson/card shapes are preserved for the UI. Explain-back fixtures return `score: null` and `persisted: false`, so rehearsal feedback cannot become mastery evidence. Live grade feedback is bounded to 240 characters. Voice uploads are inspected as RIFF/WAVE with mono 16-bit integer PCM at 16 or 24 kHz before any provider call, following [Meta speech-to-text](https://dev.meta.ai/docs/speech-to-text).

## Real progress and draft streaming

Supply `AgentContext.onEvent` to receive progress while an invocation is running. The callback selects actual Meta Responses SSE (`stream: true`) or actual Baseten Chat SSE (`stream: true`, usage included). Omitting it retains the non-streaming adapter for callers that only need a final result. Fixture mode has no artificial token timing or delayed chunks.

```ts
type AgentEvent =
  | { type: "activity"; sequence: number; at: string; agentId: AgentId;
      phase: "started" | "thinking" | "tool_started" | "tool_completed" |
        "delegating" | "completed" | "saving" | "indexing" | "waiting";
      label: string; toolName?: string; targetAgentId?: AgentId; audioProcessedMs?: number }
  | { type: "text_delta"; sequence: number; at: string; agentId: AgentId;
      field: string; delta: string; replace?: boolean };
```

Sequence numbers increase across the parent and delegated specialists. A transport can resequence them when it adds real persistence/indexing events. Activity labels describe actual starts, completions and delegation; they are fixed application text, not model reasoning. A bounded lexer extracts only top-level readable JSON strings: `body`, `answer`, `explanation`, `intent`, `description`, and `suggestedCuriosity`, narrowed to each specialist's output. Nested metadata, raw JSON, tool arguments and provider reasoning never become public draft events. Escapes and fragmented Unicode are decoded before delivery.

The source guide is the prose exception: Meta's search response streams its natural cited answer under `field: answer`; the application builds the final structured envelope from that text and provider citation annotations. Structured test responses remain compatible through the JSON lexer, so their raw objects never become drafts. A leading Markdown link remains prose. Draft source text is still provisional: without a real search call and final-answer citation annotations, the run fails instead of publishing an authoritative source result. [Meta search output](https://dev.meta.ai/docs/search-grounding).

Observed opaque markers of the form `†<16–22 digit source ID>†L<line>-L<line>` are suppressed incrementally in resource drafts and removed from final display text. This is narrow display cleanup of an observed provider artifact, not a documented citation protocol or an alternate source extractor. Ordinary dagger math and footnotes remain unchanged. Successful search activity without provider citation annotations still produces an error; this omission has occurred in live CUDA documentation checks.

Drafts are provisional and may fail validation. Accumulate them by agent ID and field; replace the current field when `replace: true`. Each new model turn emits an empty replacement before generation so a repair cannot concatenate a stale draft with its replacement. Always replace drafts with the validated final result, and never save a draft as a learning event or profile fact. Provider commentary stays in internal replay but is excluded from final text and streamed drafts. Meta's full terminal response preserves encrypted reasoning items for the next tool turn. Search actions are capped at five per call and consume the shared tool budget. [Meta Responses streaming](https://dev.meta.ai/docs/protocols/responses), [Meta tool limits](https://dev.meta.ai/docs/tool-calling), [OpenAI SDK streaming and cancellation](https://developers.openai.com/api/reference/typescript), [Baseten streaming options](https://docs.baseten.co/reference/inference-api/chat-completions).

`transcribeMetaAudio(audio, { onEvent })` uses Meta's upload SSE protocol with `Accept: text/event-stream`, `partialMode: CUMULATIVE` and audio progress enabled. It emits the shared event shape with `agentId: perception` and `field: transcript`; each transcript replaces the previous one. Timing updates may include `audioProcessedMs`. This is a separate speech capability, not visual inference. A `final: true` provider transcript is required before completion; an incomplete stream is an error. Cancellation closes provider transport and stops new public events. [Meta transcription streaming](https://dev.meta.ai/docs/speech-to-text).

## Result envelope

```text
agentId / contractVersion
runId / correlationId
mode: live | fixture
provider: meta | baseten | local | fixture
model
data: agent-specific validated output
artifacts: validated completed delegated specialist outputs + provenance
trace: action metadata only
usage: model calls, tool calls, input and output tokens
```

Runtime-generated `runId` groups the internal action trace. A durable application run may have its own identifier; store that association rather than confusing a model response ID with a persistent run ID. Token totals include child model calls. An internal delegate consumes the same overall budget as its parent.

The caller should validate proposed graph changes against canonical IDs, persist events/metadata transactionally where appropriate, and return the authoritative saved state. A proposed profile inference is not consent to make it a lasting confirmed preference.

## Current tools

| Tool | Capability | Authority |
| --- | --- | --- |
| `get_map` | Read current actor's map and relevant context | Application-scoped read port |
| `infer_metadata` | Invoke the metadata specialist | Same actor, remaining shared budget |
| `find_peers` | Invoke the peer guide | Application filters apply before data is returned |
| `learn` | Invoke solo learning companion | Same actor, remaining shared budget |

Tool contracts never accept an actor ID. Shared-session context and transcript must be loaded by the backend for the actual session participants before invoking `learning-companion` in `facilitate` mode. A browser must not be able to nominate another person's identity or supply a fabricated authoritative transcript.

Facilitation skips the private `getLearningContext` port completely. Its response can be shared with another participant, so the caller's private profile, intent and retrieval history must not enter that prompt. Solo and explain-back calls can use that actor's private context.

The runtime also limits serialized text context: 128 KB for the initial user/context payload, 80 KB per tool output and 256 KB of accumulated messages per turn. Supplied image bytes are validated and bounded separately from textual context. Model-call, tool-call, depth and deadline budgets apply to all delegates together.

## Failure contract

Errors use stable codes: `INVALID_INPUT`, `INVALID_OUTPUT`, `CONFIGURATION`, `CAPABILITY_UNAVAILABLE`, `PROVIDER`, `BUDGET_EXCEEDED`, `CANCELLED`, `TOOL_DENIED`.

No provider failure is transformed into success-shaped sample data. A caller may offer a separately labelled rehearsal mode, retain the last saved map or invite a retry. It must not present an unsaved optimistic result as durable or a fixture as a real model answer.

## Scaling path

The initial in-process transport avoids network hops and separate deployment state while the contracts are changing. Extract an agent into a worker/service only when its workload warrants independent scheduling or hardware. Preserve actor scope, schema version, budgets, cancellation, idempotency and provenance across that boundary. Durable job status and retry ownership belong to the application layer; the model cannot create unlimited jobs by recursively invoking itself.
