// Where every plan requirement lives (DESIGN §5). Rendered on /ops.
// Update `status` as backend work lands: "ui" = UI + demo path done, "stub" = typed
// hook exists but not wired, "live" = real backend, "todo" = not started.
export type Status = "live" | "ui" | "stub" | "todo";

export interface Req {
  id: string;
  name: string;
  owner: string;
  ui: string;
  hook: string;
  status: Status;
}

export const FUNCTIONAL: Req[] = [
  { id: "F1", name: "Voice + text curiosity input", owner: "Sirpreet / Connor", ui: "CommandBar (mic, text, examples)", hook: "POST /api/transcribe → lib/server/meta.transcribe", status: "ui" },
  { id: "F2", name: "Streaming expansion + canonicalization", owner: "Connor", ui: "Map bloom, Missions, Agent log", hook: "POST /api/expand (SSE) · lib/canonicalize.ts → pgvector", status: "ui" },
  { id: "F3", name: "Node card, validated cited source, Mermaid", owner: "Connor / Manpinder", ui: "Inspector: hook [1], Source, Flowchart", hook: "GET /api/card/:slug · POST /api/resources/verify (oEmbed live)", status: "ui" },
  { id: "F4", name: "Explain-back with rubric grading", owner: "Connor", ui: "Inspector → Explain it back", hook: "POST /api/explain (GRADE_SYSTEM prompt)", status: "ui" },
  { id: "F5", name: "Interest/mastery with decay, bloom/fade", owner: "Sirpreet", ui: "WorldMap blocks, fog, XP bar, pips", hook: "lib/math.ts (shared with server)", status: "live" },
  { id: "F6", name: "Time-lapse from event log", owner: "Sirpreet", ui: "Map → Your brain this week", hook: "lib/math.replay(events) · events table", status: "live" },
  { id: "F7", name: "Presence matching, reason, handshake, 60s", owner: "Amit", ui: "Explorers panel, MatchModal", hook: "POST /api/match · lib/matching.ts · Presence channel `explorers`", status: "ui" },
  { id: "F8", name: "Jigsaw session + post-session updates", owner: "Amit / Connor", ui: "/session room, phases, summary", hook: "POST /api/session/:id/message · Broadcast session:{id}", status: "ui" },
  { id: "F9", name: "Three-layer profile", owner: "Sirpreet", ui: "/profile", hook: "profiles table (static_profile, preferences, current_intent)", status: "ui" },
  { id: "F10", name: "MCP server, 4 tools, per-user tokens", owner: "Connor", ui: "/connectors console, Profile token", hook: "POST /api/mcp · lib/mcp-tools.ts · mcp_tokens table", status: "ui" },
];

export const NONFUNCTIONAL: Req[] = [
  { id: "N1", name: "First node < 2.5s · cached card < 500ms · match < 30s", owner: "Connor", ui: "Timings printed in Agent log", hook: "measured client-side per run", status: "ui" },
  { id: "N2", name: "Mobile-first, works on demo phones", owner: "Sirpreet", ui: "Bottom sheets, pinned command bar", hook: "—", status: "ui" },
  { id: "N3", name: "RLS, rate limits, Zod, server-only secrets, non-contributor model", owner: "Connor", ui: "Ops → Production trust", hook: "supabase/migrations · lib/server/ratelimit · lib/schemas", status: "stub" },
  { id: "N4", name: "Llama Guard on all peer messages, block/report, 18+", owner: "Amit", ui: "Session ✓ GUARD chips, Block, Report, Profile 18+", hook: "lib/server/moderation.ts", status: "stub" },
  { id: "N5", name: "Tech/AI domain only; schema has `domain`", owner: "Manpinder", ui: "World · ai-tech label", hook: "concepts.domain", status: "live" },
  { id: "N6", name: "Shared, cached concepts and resources", owner: "Connor", ui: "Card shows “cached per concept”", hook: "resources table keyed by concept", status: "stub" },
];

export const META_MODELS = [
  { model: "Muse Spark 1.3", job: "Expansion, node cards, explain-back grading, session facilitation", where: "/api/expand · /api/card · /api/explain · /api/session", key: "muse" },
  { model: "Web search grounding", job: "Finds 3 candidate sources per concept", where: "/api/card (GROUND)", key: "grounding" },
  { model: "Muse Voice Transcribe", job: "Curiosity capture and explain-back by voice", where: "/api/transcribe", key: "transcribe" },
  { model: "Muse Image", job: "Decorative cover tile per concept, cached", where: "Inspector cover", key: "image" },
  { model: "Llama Guard", job: "Moderates every peer message before delivery", where: "/api/session/:id/message", key: "guard" },
  { model: "MCP → Meta AI connectors", job: "Off-app capture: add_curiosity and 3 more tools", where: "/api/mcp", key: "mcp" },
  { model: "SAM 3.1 (stretch)", job: "Curiosity Lens: segment a photo, tap to add", where: "Lens modal", key: "lens" },
  { model: "Muse Code", job: "Used to build part of this app", where: "Write-up", key: "code" },
];

export const TRUST = [
  { check: "RLS on every user table", where: "supabase/migrations/0001_init.sql", status: "stub" as Status },
  { check: "Per-user LLM rate limit · 30 expansions/hour", where: "lib/server/ratelimit.ts (in-memory → Postgres)", status: "stub" as Status },
  { check: "All inputs validated with Zod", where: "lib/schemas.ts + every route", status: "live" as Status },
  { check: "Errors to Sentry", where: "lib/server/observability.ts", status: "stub" as Status },
  { check: "No secrets in client bundle", where: "lib/server/* import 'server-only'", status: "live" as Status },
  { check: "Source URLs host-allowlisted (no SSRF)", where: "/api/resources/verify", status: "live" as Status },
  { check: "20 concurrent simulated users, no failures", where: "Load test (Amit, Tue)", status: "todo" as Status },
  { check: "User data only on non-contributor model", where: "env.metaModel vs metaDevModel", status: "live" as Status },
];

export const PIPELINE = [
  { lane: "Solo loop", steps: [
    { name: "TRANSCRIBE", model: "Voice Transcribe", route: "/api/transcribe", key: "transcribe" },
    { name: "EXPAND", model: "Muse Spark · stream", route: "/api/expand", key: "muse" },
    { name: "CANONICALIZE", model: "embeddings ≥ 0.88", route: "pgvector", key: "supabase" },
    { name: "GROUND", model: "web search", route: "/api/card", key: "grounding" },
    { name: "OEMBED", model: "YouTube oEmbed / HTTP", route: "/api/resources/verify", key: "live" },
    { name: "GRADE", model: "Muse Spark · rubric", route: "/api/explain", key: "muse" },
  ] },
  { lane: "Social loop", steps: [
    { name: "PRESENCE", model: "Supabase Presence", route: "channel explorers", key: "presence" },
    { name: "MATCH", model: "score job · 15s", route: "/api/match", key: "live" },
    { name: "HANDSHAKE", model: "both accept · 60s", route: "match_requests", key: "supabase" },
    { name: "GUARD", model: "Llama Guard", route: "/api/session/:id/message", key: "guard" },
    { name: "FACILITATE", model: "Muse Spark · jigsaw", route: "/api/session/:id/message", key: "muse" },
  ] },
  { lane: "Off-app", steps: [
    { name: "MCP", model: "add_curiosity", route: "/api/mcp", key: "mcp" },
    { name: "INBOX", model: "Realtime broadcast", route: "/api/inbox (poll)", key: "presence" },
    { name: "EXPAND", model: "same pipeline", route: "/api/expand", key: "muse" },
  ] },
];
