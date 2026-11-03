import { z } from "zod";

/** Versioned, transport-independent contracts. Importing this file does not call a model. */
export const AGENT_CONTRACT_VERSION = "1.0" as const;
export const AgentIdSchema = z.enum(["metadata", "knowledge-map", "peer-guide", "learning-companion", "resource-guide", "perception"]);
export type AgentId = z.infer<typeof AgentIdSchema>;
export type AgentMode = "live" | "fixture";
export type ProviderId = "meta" | "baseten" | "fixture" | "local";

const short = z.string().trim().min(1).max(500);
const long = z.string().trim().min(1).max(12_000);
export const ConceptSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  title: z.string().min(1).max(120),
  hook: z.string().max(500),
  difficulty: z.number().min(0).max(1).default(0.4),
  edge: z.object({ from: z.string().max(80), kind: z.enum(["prerequisite", "related", "part_of"]) }).optional(),
});
export type ConceptProposal = z.infer<typeof ConceptSchema>;
export const PeerSchema = z.object({
  id: z.string().min(1).max(100),
  displayName: z.string().max(120),
  reason: z.string().max(600),
  sharedConcepts: z.array(z.string().max(80)).max(20),
  complementaryConcepts: z.array(z.string().max(80)).max(20),
  score: z.number().min(0).max(1),
});
export type PeerCandidate = z.infer<typeof PeerSchema>;

export const MetadataInput = z.object({
  text: long,
  context: z.record(z.string(), z.unknown()).optional(),
});
export const MetadataOutput = z.object({
  intent: short,
  goals: z.array(short).max(8),
  concepts: z.array(z.object({ slug: z.string().max(80), title: z.string().max(120), confidence: z.number().min(0).max(1) })).max(12),
  experience: z.enum(["unknown", "beginner", "intermediate", "advanced"]),
  language: z.string().max(30).nullable(),
  availableMinutes: z.number().int().min(1).max(480).nullable(),
  participation: z.enum(["solo", "peer", "either", "unknown"]),
  matchingText: z.string().max(1500),
  uncertainty: z.array(z.string().max(300)).max(8),
});
export const KnowledgeMapInput = z.object({
  text: long,
  objective: z.enum(["expand", "recommend", "plan", "summarize"]).default("expand"),
  /** Present when the learner goes deeper into one saved concept. New concepts attach under focus.slug. */
  focus: z.object({ slug: z.string().min(1).max(80), title: z.string().min(1).max(150), siblings: z.array(z.string().min(1).max(80)).max(60).default([]) }).optional(),
  /** The saved question this expansion extends. Bootstrap merges the result into that question's path. */
  extendsRunId: z.string().min(1).max(80).optional(),
});
export const KnowledgeOverviewGroupSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  title: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(360),
  conceptSlugs: z.array(z.string().min(1).max(80)).min(1).max(200),
});
export const KnowledgeOverviewSourceSchema = z.object({
  concepts: z.array(z.object({ slug: z.string().min(1).max(80), title: z.string().min(1), hook: z.string() })).max(200),
  edges: z.array(z.object({ src: z.string().min(1).max(80), dst: z.string().min(1).max(80), kind: z.enum(["prerequisite", "related", "part_of"]) })).max(800),
});
/** Coverage is an exact partition of owner-authorized concepts, never a sampled map. */
export function validateKnowledgeOverviewGroups(groups: z.infer<typeof KnowledgeOverviewGroupSchema>[], conceptSlugs: string[]) {
  if (!groups.length || groups.length > 12) throw new AgentError("INVALID_OUTPUT", "Return one to twelve topic groups for this non-empty map.");
  if (new Set(groups.map(group => group.id)).size !== groups.length) throw new AgentError("INVALID_OUTPUT", "Topic groups must have unique IDs.");
  const expected = new Set(conceptSlugs), assigned = groups.flatMap(group => group.conceptSlugs);
  if (expected.size !== conceptSlugs.length || assigned.length !== expected.size || new Set(assigned).size !== assigned.length || assigned.some(slug => !expected.has(slug))) {
    throw new AgentError("INVALID_OUTPUT", "Include every saved concept exactly once across the topic groups. Do not omit, duplicate or invent concept IDs.");
  }
}
export const KnowledgeMapOutput = z.object({
  intent: short,
  root: z.string().min(1).max(80),
  rootTitle: z.string().min(1).max(120),
  concepts: z.array(ConceptSchema).max(12),
  explanation: z.string().min(1).max(1800),
  recommendedPeerIds: z.array(z.string().max(100)).max(10).default([]),
  nextActions: z.array(z.string().max(200)).max(6).default([]),
  groups: z.array(KnowledgeOverviewGroupSchema).max(12).default([]),
});
export const PeerGuideInput = z.object({ query: z.string().max(1500).default(""), limit: z.number().int().min(1).max(10).default(5) });
export const PeerGuideOutput = z.object({ peers: z.array(PeerSchema).max(10), status: z.enum(["matches", "none"]), explanation: z.string().max(1000) });
export const LearningInput = z.object({
  mode: z.enum(["solo", "facilitate", "explain-back"]).default("solo"),
  presentation: z.enum(["moment", "course"]).default("moment"),
  concept: short,
  message: z.string().max(12_000).default(""),
  context: z.record(z.string(), z.unknown()).optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(30).default([]),
  source: z.object({ title: z.string().max(300), url: z.string().url().max(2000), excerpt: z.string().max(6000).optional() }).optional(),
});
export const LearningOutput = z.object({
  mode: z.enum(["solo", "facilitate", "explain-back"]),
  title: z.string().max(180),
  body: z.string().min(1).max(6000),
  format: z.enum(["predict", "manipulate", "analogy", "story", "source-clip", "short-read", "discussion", "feedback"]),
  interaction: z.object({ prompt: z.string().max(600), options: z.array(z.object({ label: z.string().max(180), reveal: z.string().max(600) })).max(6) }).nullable().default(null),
  branches: z.array(z.object({ title: z.string().max(150), why: z.string().max(300) })).max(4).default([]),
  /** explain-back: the next practice question, aimed at the gap the feedback found. Empty for other modes. */
  nextPrompt: z.string().max(300).default(""),
  challenge: z.object({ kind: z.enum(["spot-the-error", "order-steps", "predict-output", "fill-blank"]), prompt: z.string().max(600), options: z.array(z.string().max(250)).min(2).max(6), correct: z.number().int().min(0).max(5), explanation: z.string().max(800) }).nullable().default(null),
  adaptedNote: z.string().max(500).default(""),
  score: z.number().int().min(0).max(3).nullable().default(null),
  lessons: z.array(z.object({ title: z.string().min(1).max(80), body: z.string().min(1).max(600), format: z.enum(["hook", "mechanism", "example", "recall"]) })).max(5).default([]),
});
export const ResourceInput = z.object({ query: short, kind: z.enum(["any", "video", "article", "documentation"]).default("any") });
export const ResourceOutput = z.object({
  answer: z.string().max(5000),
  sources: z.array(z.object({ url: z.string().url().max(2000), title: z.string().max(500) })).max(12),
  grounded: z.boolean(),
});
export const PerceptionInput = z.object({
  prompt: short.default("Describe what could be learned from this image. Identify topics without identifying people or inferring sensitive traits."),
  imageDataUrl: z.string().max(14_000_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
});
export const PerceptionOutput = z.object({ description: z.string().max(4000), suggestedCuriosity: short, concepts: z.array(z.string().max(150)).max(10), uncertainty: z.array(z.string().max(300)).max(5) });

export const INPUT_SCHEMAS = {
  metadata: MetadataInput,
  "knowledge-map": KnowledgeMapInput,
  "peer-guide": PeerGuideInput,
  "learning-companion": LearningInput,
  "resource-guide": ResourceInput,
  perception: PerceptionInput,
} as const;
export const OUTPUT_SCHEMAS = {
  metadata: MetadataOutput,
  "knowledge-map": KnowledgeMapOutput,
  "peer-guide": PeerGuideOutput,
  "learning-companion": LearningOutput,
  "resource-guide": ResourceOutput,
  perception: PerceptionOutput,
} as const;
export type AgentInput<I extends AgentId> = z.input<(typeof INPUT_SCHEMAS)[I]>;
export type AgentOutput<I extends AgentId> = z.infer<(typeof OUTPUT_SCHEMAS)[I]>;

export type AgentActivityPhase = "started" | "thinking" | "tool_started" | "tool_completed" | "delegating" | "completed" | "saving" | "indexing" | "waiting";
/** Public progress only. Draft text is unvalidated until the final AgentResult. */
export type AgentEvent =
  | { type: "activity"; sequence: number; at: string; agentId: AgentId; phase: AgentActivityPhase; label: string; toolName?: string; targetAgentId?: AgentId; audioProcessedMs?: number }
  | { type: "text_delta"; sequence: number; at: string; agentId: AgentId; field: string; delta: string; replace?: boolean };
/** Internal provider seam: only final-answer text and fixed public activity labels. */
export type ModelEvent =
  | { type: "text_delta"; delta: string }
  | { type: "activity"; phase: "waiting" | "tool_started" | "tool_completed"; label: string; toolName?: string };

/** Construct actorId server-side. Never accept authority/permissions from model output. */
export interface AgentContext {
  actorId: string;
  correlationId?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
  budget?: Partial<AgentBudget>;
  onEvent?: (event: AgentEvent) => void;
}
export interface AgentBudget { maxModelCalls: number; maxToolCalls: number; maxDepth: number; timeoutMs: number; maxOutputTokens: number }
export interface ToolContext { actorId: string; correlationId: string; runId: string; signal: AbortSignal }
export interface AgentTools {
  getMap: (context: ToolContext) => Promise<unknown>;
  findPeers: (input: z.infer<typeof PeerGuideInput>, context: ToolContext) => Promise<PeerCandidate[]>;
  getLearningContext?: (concept: string, context: ToolContext) => Promise<unknown>;
}
export interface AgentTraceEvent {
  sequence: number; agentId: AgentId; kind: "started" | "model" | "tool" | "delegate" | "completed" | "failed";
  name: string; at: string; durationMs?: number;
}
export interface AgentUsage { modelCalls: number; toolCalls: number; inputTokens: number; outputTokens: number }
/** Validated delegated outputs only: no raw map reads, prompts, images or reasoning replay. */
export type AgentArtifact = { [I in AgentId]: { agentId: I; data: AgentOutput<I>; provider: ProviderId; model: string } }[AgentId];
export interface AgentResult<I extends AgentId = AgentId> {
  agentId: I; contractVersion: typeof AGENT_CONTRACT_VERSION; runId: string; correlationId: string;
  mode: AgentMode; provider: ProviderId; model: string;
  data: AgentOutput<I>; artifacts: AgentArtifact[]; trace: AgentTraceEvent[]; usage: AgentUsage;
}
export interface ModelTool { name: string; description: string; parameters: Record<string, unknown> }
export interface ModelToolCall { id: string; name: string; arguments: string }
export type ModelMessage = { role: "developer" | "user" | "assistant" | "tool"; content: string; toolCallId?: string; toolCalls?: ModelToolCall[] };
export interface ModelRequest {
  agentId: AgentId; messages: ModelMessage[]; tools: ModelTool[]; signal: AbortSignal;
  maxOutputTokens: number; outputSchema: Record<string, unknown>;
  continuation?: unknown; imageDataUrl?: string; webSearch?: boolean; maxBuiltInToolCalls?: number;
  onEvent?: (event: ModelEvent) => void;
}
export interface ModelTurn {
  text: string; toolCalls: ModelToolCall[]; continuation?: unknown;
  provider: ProviderId; model: string;
  usage?: { inputTokens: number; outputTokens: number };
  citations?: Array<{ url: string; title: string }>;
  searchPerformed?: boolean;
  builtInToolCalls?: number;
}
export interface AgentModel { complete(request: ModelRequest): Promise<ModelTurn> }

export type AgentErrorCode = "INVALID_INPUT" | "INVALID_OUTPUT" | "CONFIGURATION" | "CAPABILITY_UNAVAILABLE" | "PROVIDER" | "BUDGET_EXCEEDED" | "CANCELLED" | "TOOL_DENIED";
export class AgentError extends Error {
  constructor(public readonly code: AgentErrorCode, message: string, public readonly retryable = false) { super(message); this.name = "AgentError"; }
}

export const AGENT_CARDS = [
  { id: "knowledge-map", name: "Knowledge map assistant", description: "Maintains a proposed learning map and delegates metadata, peer discovery and learning assistance.", dependencies: ["metadata", "peer-guide", "learning-companion"], tools: ["get_map", "infer_metadata", "find_peers", "learn"] },
  { id: "metadata", name: "Metadata specialist", description: "Infers correctable current intent and a limited matching projection; never writes lasting profile facts.", dependencies: [], tools: [] },
  { id: "peer-guide", name: "Peer guide", description: "Explains eligible candidates from the server-filtered matching projection; cannot invent people or bypass consent.", dependencies: [], tools: ["findPeers"] },
  { id: "learning-companion", name: "Learning companion", description: "The same specialist supports solo learning, explain-back and shared-session facilitation.", dependencies: [], tools: ["getLearningContext"] },
  { id: "resource-guide", name: "Resource guide", description: "Finds cited learning sources through Meta search grounding.", dependencies: [], tools: ["web_search"] },
  { id: "perception", name: "Visual understanding", description: "Turns an explicitly supplied image into a learning question with uncertainty.", dependencies: [], tools: [] },
] as const;
