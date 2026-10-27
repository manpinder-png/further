# Architecture and API

## Starter decision

The bootstrap uses standard-library Python with static HTML/CSS/JavaScript so all teammates can run it without installing a framework or spending credits. It is a local development baseline, not a final stack decision.

Boundaries:

| Area | Files | Responsibility |
| --- | --- | --- |
| Browser experience | web/ | Goal form, sample results, practice session |
| Domain and matching | further/domain.py | Validated goals, sample fixtures, explainable lexical ranking |
| Provider adapter | further/ai.py | Server-side Meta call and validated session-plan output |
| HTTP boundary | further/server.py | Local routes, body limits, static allowlist, origin/host checks |
| Verification | tests/ | Matching behavior, API contract, provider failures, local security boundary |

## Routes

### GET /api/health

Returns status, ai_mode, and sample_peers. Never returns keys.

### GET /api/peers

Returns four explicitly labelled sample profiles. There is no real presence queue yet.

### POST /api/matches

Request:

    {
      "topic": "Why are GPUs useful for machine learning?",
      "level": "beginner",
      "language": "English",
      "minutes": 15
    }

Levels: beginner, intermediate, advanced. Starter languages: English, Hindi, Punjabi, Spanish. Time: integer 10–60 minutes. Topic: 5–240 characters.

Response: matches array; each result includes id, name, topic, level, language, minutes, sample, score, shared_terms, and reason. The envelope declares sample=true and matching_mode=keyword-baseline.

Language and sufficient time are hard constraints. Shared topic tokens and level distance determine ranking. This lexical approach has no semantic or multilingual claim; replace it behind the same contract.

### POST /api/plan

Accepts the same validated goal. Returns question, exactly three prompts, check, mode, and model.

In demo mode, it returns an English facilitation template with no provider call. In meta mode, it uses the selected language and learning goal in a server-side Meta prompt. Invalid configuration or provider output produces a visible 502 error, not a silent fixture fallback.

Common errors: 400 invalid JSON/goal, 403 invalid host/origin, 404 unknown route, 413 invalid body size, 415 wrong content type, 502 provider failure.

## Key and input boundaries

- Read the model key only from server environment/local ignored .env.
- Serve only the three allowlisted web assets; never arbitrary repository files.
- Bind to 127.0.0.1 by default and reject other Host/Origin values.
- Limit requests to 8192 bytes; cap provider response size and generation tokens.
- Treat learner text as untrusted data, and validate model output before rendering.
- Browser rendering uses textContent, not interpolated model HTML.
- No conversation transcripts, names, or learning goals are logged by the starter server.

## Before public deployment

Add authentication and room membership authorization, persistent presence with expiration, atomic matching, protected real-time transport, abuse controls, rate limiting, TLS, retention controls, observability, and account spending controls. Use a production server/framework. The standard-library development server is not a production host.

Provider evidence: https://dev.meta.ai/docs/quickstart and https://dev.meta.ai/docs/protocols/chat-completions (checked October 27, 2026). The live adapter is unit-tested with mocked responses; live account and billing checks remain outstanding.
