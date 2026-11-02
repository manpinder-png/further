// Historical DESIGN §5 planning data, retained for the retired builder console.
// This is not the current implementation inventory or service verification.
// Read docs/CODE_MAP.md and docs/ARCHITECTURE.md, or open /architecture, for the
// current system. These labels describe planning progress only; even "live"
// does not establish that a configured service has been verified today.
export type Status = "live" | "wired" | "ui" | "stub" | "todo";

export interface Req {
  id: string;
  name: string;
  owner: string;
  ui: string;
  hook: string;
  status: Status;
}

export const FUNCTIONAL: Req[] = [
  { id: "F1", name: "Voice + text curiosity input", owner: "Sirpreet / Connor", ui: "CommandBar (mic, text, examples)", hook: "POST /api/transcribe → Meta ASR /asr/transcribe", status: "wired" },
  { id: "F2", name: "Streaming expansion + canonicalization", owner: "Connor", ui: "Map bloom, Missions, Agent log", hook: "POST /api/expand (SSE) · concepts/events persistence", status: "wired" },
  { id: "F3", name: "Node card, validated cited source, Mermaid", owner: "Connor / Manpinder", ui: "Inspector: hook [1], Source, Flowchart", hook: "GET /api/card → Meta Responses web search + URL citations", status: "wired" },
  { id: "F4", name: "Explain-back with rubric grading", owner: "Connor", ui: "Inspector → Explain it back", hook: "POST /api/explain (GRADE_SYSTEM prompt)", status: "wired" },
  { id: "F5", name: "Interest/mastery with decay, bloom/fade", owner: "Sirpreet", ui: "WorldMap blocks, fog, XP bar, pips", hook: "lib/math.ts (shared with server)", status: "live" },
  { id: "F6", name: "Time-lapse from event log", owner: "Sirpreet", ui: "Map → Your brain this week", hook: "lib/math.replay(events) · events table", status: "live" },
  { id: "F7", name: "Presence matching, reason, handshake, 60s", owner: "Amit", ui: "Explorers panel, MatchModal", hook: "POST /api/match · atomic RPC · durable polling", status: "wired" },
  { id: "F8", name: "Jigsaw session + post-session updates", owner: "Amit / Connor", ui: "/session room, phases, summary", hook: "guarded session_messages · atomic finish RPC", status: "wired" },
  { id: "F9", name: "Three-layer profile", owner: "Sirpreet", ui: "/profile", hook: "authenticated PATCH → profiles (static_profile, preferences, current_intent)", status: "wired" },
  { id: "F10", name: "Planned standards-compliant off-app connector", owner: "Connor", ui: "Historical connector prototype retired", hook: "/api/mcp returns 410; authenticated /api/agents exists; MCP/A2A adapters are not implemented", status: "todo" },
];

export const NONFUNCTIONAL: Req[] = [
  { id: "N1", name: "Latency targets: first node < 2.5s · cached card < 500ms · match < 30s", owner: "Connor", ui: "Historical performance targets", hook: "Not established performance guarantees; see docs/VERIFICATION.md", status: "todo" },
  { id: "N2", name: "Mobile-first, works on demo phones", owner: "Sirpreet", ui: "Bottom sheets, pinned command bar", hook: "—", status: "ui" },
  { id: "N3", name: "Authenticated server authorization, validation and server-only secrets", owner: "Connor", ui: "Current trust boundaries are documented separately", hook: "Backend ownership checks; legacy Supabase RLS is not the deployed authorization layer", status: "wired" },
  { id: "N4", name: "Block/report and adult eligibility; automated classifier remains planned", owner: "Amit", ui: "Session moderation status must state its limitations", hook: "No Llama Guard/content classifier is configured for message delivery", status: "todo" },
  { id: "N5", name: "Historical Tech/AI-only scope proposal", owner: "Manpinder", ui: "Original domain label", hook: "Not a current product domain restriction", status: "ui" },
  { id: "N6", name: "Shared, cached concepts and resources", owner: "Connor", ui: "Card shows “cached per concept”", hook: "global concepts/aliases; card-cache migration", status: "wired" },
];

export const META_MODELS = [
  { model: "Muse Spark 1.3", job: "Expansion, node cards, explain-back grading, session facilitation", where: "/api/expand · /api/card · /api/explain · /api/session", key: "muse" },
  { model: "Web search grounding", job: "Finds 3 candidate sources per concept", where: "/api/card (GROUND)", key: "grounding" },
  { model: "Muse Voice Transcribe", job: "Curiosity capture and explain-back by voice", where: "/api/transcribe", key: "transcribe" },
  { model: "Muse Image (historical proposal)", job: "Planned decorative cover generation; not implemented", where: "Image understanding uses the configured Meta perception route instead", key: "image" },
  { model: "Llama Guard (planned)", job: "Automated content classification is not configured", where: "Messages currently have validation, block and report controls", key: "guard" },
  { model: "MCP/A2A adapters (planned protocol work)", job: "Off-app standards integration is not implemented", where: "Retired /api/mcp returns 410; /api/agents is the current authenticated interface", key: "mcp" },
  { model: "SAM 3.1 (historical stretch proposal)", job: "Photo segmentation is not implemented", where: "Planned Lens experience", key: "lens" },
  { model: "Muse Code (historical proposal)", job: "Development attribution is not verified by this plan", where: "Do not use as evidence of model usage", key: "code" },
];

export const TRUST = [
  { check: "Database RLS remains a hardening task", where: "Current application authorization uses backend ownership checks; legacy Supabase migrations are not the deployed schema", status: "todo" as Status },
  { check: "Per-user LLM rate limit · 30 expansions/hour", where: "lib/server/ratelimit.ts (in-memory → Postgres)", status: "stub" as Status },
  { check: "Request validation and authenticated backend checks", where: "See current route ownership and validation boundaries in docs/CODE_MAP.md", status: "wired" as Status },
  { check: "Errors to Sentry", where: "lib/server/observability.ts", status: "stub" as Status },
  { check: "No secrets in client bundle", where: "lib/server/* import 'server-only'", status: "live" as Status },
  { check: "Source URLs host-allowlisted (no SSRF)", where: "/api/resources/verify", status: "live" as Status },
  { check: "Load-test target: 20 concurrent simulated users", where: "Not a verified result; see docs/VERIFICATION.md", status: "todo" as Status },
  { check: "Meta-only runtime inference policy", where: "Current provider routing and allowed models: /architecture and domains/agents", status: "wired" as Status },
];

export const PIPELINE = [
  { lane: "Solo loop", steps: [
    { name: "TRANSCRIBE", model: "Voice Transcribe", route: "/api/transcribe", key: "transcribe" },
    { name: "EXPAND", model: "Muse Spark · stream", route: "/api/expand", key: "muse" },
    { name: "CANONICALIZE", model: "Validated concept IDs and aliases; no fixed vector merge threshold", route: "lib/canonicalize.ts", key: "live" },
    { name: "GROUND", model: "web search", route: "/api/card", key: "grounding" },
    { name: "OEMBED", model: "YouTube oEmbed / HTTP", route: "/api/resources/verify", key: "live" },
    { name: "GRADE", model: "Muse Spark · rubric", route: "/api/explain", key: "muse" },
  ] },
  { lane: "Social loop", steps: [
    { name: "PRESENCE", model: "Persisted expiry and HTTP polling", route: "/api/local/presence", key: "presence" },
    { name: "MATCH", model: "Semantic retrieval and deterministic eligibility/ranking", route: "/api/match", key: "live" },
    { name: "HANDSHAKE", model: "Mutual acceptance with persisted expiry", route: "/api/match", key: "presence" },
    { name: "GUARD (PLANNED)", model: "No automated content classifier configured", route: "Block/report and message validation are available", key: "guard" },
    { name: "FACILITATE", model: "Muse Spark · jigsaw", route: "/api/session/:id/message", key: "muse" },
  ] },
  { lane: "Off-app protocol roadmap (not implemented)", steps: [
    { name: "MCP/A2A", model: "Standards adapter planned", route: "Legacy /api/mcp retired (410)", key: "mcp" },
    { name: "AGENT API", model: "Current authenticated callable agent interface", route: "/api/agents", key: "live" },
  ] },
];
