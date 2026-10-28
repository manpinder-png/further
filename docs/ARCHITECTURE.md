# Architecture and API

## Starter decision

The bootstrap uses standard-library Python with static HTML/CSS/JavaScript so all teammates can run it without installing a framework or spending credits. It is a local development baseline, not a final stack decision.

Boundaries:

| Area | Files | Responsibility |
| --- | --- | --- |
| Browser experience | web/ | Six-step journey (app.js); brain map force layout (map.js) |
| Domain and matching | further/domain.py | Validated goals and profiles, sample learners and clusters, lexical ranking, mixed-tier groups, wrap-up rules |
| AI tasks | further/ai.py | Prompts, schemas and validation for the profile and session plan |
| Providers | further/providers.py | `complete_json(system, user, schema)` for meta, fireworks, baseten, demo; ordered fallback |
| Provider check | further/check_providers.py | `python3 -m further.check_providers`: one tiny request per provider |
| HTTP boundary | further/server.py | Local routes, body limits, static allowlist, origin/host checks |
| Verification | tests/ | Matching behavior, API contract, provider failures, local security boundary |

## Routes

### GET /api/health

Returns status, ai_mode (demo, live or meta), providers (order, strict, and whether each is configured), and sample_peers. Never returns key, URL or model values.

### GET /api/learners

Returns 80 sample learners (id, name, cluster, concept, intent, tier, experience_years, learning_style, language, minutes, online, sample=true), 8 cluster summaries (id, label, concept, size, online), and the online count.

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

Accepts the same validated goal. Returns question, exactly three prompts, check, and the served-by fields: mode and provider (meta, fireworks, baseten or demo), model, latency_ms, and fallbacks (providers that failed, with a safe reason).

The demo provider returns an English facilitation template with no network call. Live providers receive the selected language and learning goal in a server-side prompt.

### POST /api/profile

Request: `{"intent": "<3-240 characters>"}`. Returns `profile` plus the served-by fields. The model drafts focus_area, concept, sharpened_question, tier (1-5, for this concept only), learning_style (visual, hands-on, discussion, reading), language and availability_minutes (10-60). The server adds the fixed name, experience_years and expertise_areas. The demo provider uses keyword heuristics.

### POST /api/placement

Request: `{"profile": {...}}` (the full, possibly edited profile; validated again). Returns the nearest cluster id, label and a reason: exact focus-area match first, then shared keywords, then the most active cluster.

### POST /api/group

Request: `{"profile": {...}, "exclude": [learner ids already shown]}`. Returns up to four online sample learners from the nearest cluster in the same language, with tiers mixed on purpose (ahead, same, newer), a rationale, scripted room messages and sample explain-back lines. If everyone has been shown, people repeat and `recycled` is true.

### POST /api/wrapup

Request: `{"profile": {...}, "explanation": "<0-400 characters>", "members": [ids], "marked": [ids you marked]}`. Returns tier_before, tier_after, tier_reason, marks_received (simulated from explanation length, flagged by marks_simulated), reputation_gained with a breakdown, and a memory-trail entry. Rules: +1 tier (max 5) with at least six words and at least one mark; reputation is +10 per mark received, +3 per mark given, +5 for finishing. Tier and reputation are separate, and nothing is ranked across users.

### POST /mcp (stretch stub)

Minimal JSON-RPC 2.0: initialize, tools/list, tools/call. Tools: share_my_intent (intent → profile, via the provider chain) and find_my_group (profile → mixed-tier sample group). Tool errors come back as `isError: true` results; unknown methods and tools are JSON-RPC errors. Local stub only: no sessions, streaming or auth, and the same loopback and origin checks as every other route.

## Provider fallback

Order comes from FURTHER_PROVIDERS (default meta,fireworks,baseten,demo); demo is always last. A provider without settings is skipped. An HTTP error, timeout, unparsable JSON or schema/validation failure moves on to the next provider and is reported in `fallbacks`. FURTHER_AI_MODE=demo forces demo only; FURTHER_AI_MODE=meta forces Meta only and turns failures into a visible 502 with no fallback, the starter's original behaviour. Fireworks and Baseten share one OpenAI-compatible urllib client; their URLs and model IDs are deliberately not defaulted (see TODOs in providers.py).

Common errors: 400 invalid JSON/goal/profile, 403 invalid host/origin, 404 unknown route, 413 invalid body size, 415 wrong content type, 502 provider failure.

## Key and input boundaries

- Read the model key only from server environment/local ignored .env.
- Serve only the four allowlisted web assets (index, app.js, map.js, styles.css); never arbitrary repository files.
- Bind to 127.0.0.1 by default and reject other Host/Origin values.
- Limit requests to 8192 bytes; cap provider response size and generation tokens.
- Treat learner text as untrusted data, and validate model output before rendering.
- Browser rendering uses textContent, not interpolated model HTML.
- No conversation transcripts, names, or learning goals are logged by the starter server. Provider log lines contain only task, provider, model, latency and a safe failure reason.

## Before public deployment

Add authentication and room membership authorization, persistent presence with expiration, atomic matching, protected real-time transport, abuse controls, rate limiting, TLS, retention controls, observability, and account spending controls. Use a production server/framework. The standard-library development server is not a production host.

Provider evidence: https://dev.meta.ai/docs/quickstart and https://dev.meta.ai/docs/protocols/chat-completions (checked October 27, 2026). The live adapters are unit-tested with mocked responses; run `python3 -m further.check_providers` with real keys for live account and billing checks.
