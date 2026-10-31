// Shared domain types. Mirrors supabase/migrations/0001_init.sql.
// Client code keys concepts by slug; the database keys them by uuid.

export type EdgeKind = "prerequisite" | "related" | "part_of";
export type NodeState = "seeded" | "explored" | "understood";
export type EventKind = "open" | "dwell" | "skip" | "watch" | "explain" | "session" | "seed";

export interface Concept {
  slug: string;
  title: string;
  hook: string;
  summary?: string;
  domain: string;
  difficulty?: number;
  coverUrl?: string; // Muse Image tile, cached per concept
  /** Tile position on the world map. Assigned by lib/layout.ts on the client. */
  x?: number;
  y?: number;
}

export interface Edge {
  src: string;
  dst: string;
  kind: EdgeKind;
}

export interface UserNode {
  slug: string;
  interest: number; // 0..1, drives opacity, decays with a 3-day half-life
  mastery: number; // 0..1, drives size and glow
  state: NodeState;
  lastTouched: number; // epoch ms
  learnedWith?: string; // "learned with Amit"
}

export interface Resource {
  slug: string;
  url: string;
  kind: "video" | "article" | "lecture";
  title: string;
  provider: string;
  startSeconds?: number;
  verifiedAt?: number;
  /** True when this came from seed data rather than the grounding pipeline. */
  demo?: boolean;
}

export interface FEvent {
  id: number;
  slug: string;
  kind: EventKind;
  payload?: Record<string, unknown>;
  at: number; // epoch ms
}

export interface Explorer {
  id: string;
  name: string;
  /** Seed/demo explorers must always be labeled in the UI. */
  demo: boolean;
  activeConcepts: string[]; // top 5 by interest
  mastery: Record<string, number>;
  openToMatch: boolean;
  language: string;
  lastActive: number;
  color: string; // player-head colour
}

export interface MatchRequest {
  id: string;
  peer: Explorer;
  concept: string; // shared concept slug
  reason: string; // "ahead on memory bandwidth"
  peerStrong: string;
  youStrong: string;
  score: number;
  expiresAt: number;
  status: "pending" | "accepted" | "declined" | "expired" | "waiting";
}

export interface Profile {
  displayName: string;
  staticProfile: { role: string; background: string; age18Plus: boolean };
  preferences: { style: string; pace: string; inferred: boolean };
  currentIntent: string;
  openToMatch: boolean;
  language: string;
}

/** One line of the streaming expansion (plan §5.2). */
export type ExpansionLine =
  | { type: "intent"; intent: string; root: string; rootTitle?: string }
  | {
      type: "node";
      slug: string;
      title: string;
      hook: string;
      edge: { from: string; kind: EdgeKind };
      difficulty: number;
      canonical?: { reusedSlug: string; similarity: number } | null;
    }
  | { type: "done"; count: number; ms: number }
  | { type: "error"; message: string };

export type AgentName =
  | "TRANSCRIBE"
  | "EXPAND"
  | "CANONICALIZE"
  | "GROUND"
  | "OEMBED"
  | "CARD"
  | "GRADE"
  | "MATCH"
  | "FACILITATE"
  | "GUARD"
  | "MCP"
  | "IMAGE"
  | "SYSTEM";

export interface LogEntry {
  id: number;
  at: number;
  agent: AgentName;
  msg: string;
  level: "info" | "ok" | "warn" | "err";
  demo?: boolean;
}
