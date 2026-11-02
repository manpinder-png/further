import type { Concept, Edge, Explorer, FEvent, MatchRequest, Profile } from "../../lib/types";

/** Browser-facing contracts. These are transport DTOs, not database entities. */
export type DataMode = "local" | "demo";
export type LocalProfile = Profile & { availableMinutes?: number };
export interface Mission {
  id: number;
  runId?: string;
  text: string;
  source: "voice" | "text" | "mcp" | "lens" | "agent";
  at: number;
  status: "running" | "done" | "error";
  intent?: string;
  error?: string;
  added: number;
  reused: number;
  slugs?: string[];
}

/** Durable runs replace matching UI placeholders; unrelated in-flight attempts stay visible. */
export function mergeMissions(current: readonly Mission[], saved: readonly Mission[]): Mission[] {
  const temporary = current.filter((mission) => !mission.runId && mission.status !== "done");
  for (const mission of saved) {
    // Match once, nearest in time, so one saved run cannot erase two simultaneous attempts.
    let closest = -1;
    let distance = 60_000;
    temporary.forEach((candidate, index) => {
      const delta = Math.abs(candidate.at - mission.at);
      if (candidate.text === mission.text && delta < distance) { closest = index; distance = delta; }
    });
    if (closest !== -1) temporary.splice(closest, 1);
  }
  return [...saved, ...temporary].sort((a, b) => b.at - a.at || b.id - a.id);
}
/** Server profiles include identity/revision fields; only explicit edits may be sent back. */
export function writableProfile(profile: LocalProfile): LocalProfile {
  return {
    displayName: profile.displayName,
    staticProfile: { role: profile.staticProfile.role, background: profile.staticProfile.background, age18Plus: profile.staticProfile.age18Plus },
    preferences: { style: profile.preferences.style, pace: profile.preferences.pace, inferred: profile.preferences.inferred },
    currentIntent: profile.currentIntent,
    openToMatch: profile.openToMatch,
    language: profile.language,
    ...(profile.availableMinutes === undefined ? {} : { availableMinutes: profile.availableMinutes }),
  };
}
export interface LocalIdentity {
  actorId: string;
  profile: LocalProfile;
  personas: Array<{ id: string; displayName: string }>;
  mode: "local";
}
export interface MapSnapshot {
  peerNames?: Record<string, string>;
  actorId?: string;
  mode?: "local";
  modelMode?: "live" | "fixture";
  concepts: Concept[];
  edges: Edge[];
  events: FEvent[];
  profile?: LocalProfile | null;
  explorers?: Explorer[];
  match?: MatchRequest | null;
  currentSessionId?: string | null;
  missions?: Mission[];
  sessions?: Array<{ id: string; conceptSlug: string; participants: string[]; createdAt: number; endedAt?: number; summary: string[] }>;
}
export interface RoomMessage {
  id: number | string;
  who: "facilitator" | "me" | "peer" | "system";
  text: string;
  guard?: { safe: boolean; engine: string; ms: number; category?: string };
  demo?: boolean;
}
export interface RoomSnapshot {
  id: string;
  peer: Explorer;
  youStrong: string;
  peerStrong: string;
  shared: string;
  endedAt?: string | number | null;
  blocked?: boolean;
  messages: RoomMessage[];
  summary?: string[];
}

/** These keys identify one intended mutation across retries. */
export const mutationKey = () => crypto.randomUUID();
export function errorMessage(value: unknown, fallback = "That didn't finish. Please try again."): string {
  if (value instanceof Error && value.message) return value.message;
  return fallback;
}
