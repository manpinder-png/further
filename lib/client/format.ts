// Learner-facing wording in one place, so the map, rail, inspector and profile agree.
import type { NodeState } from "../types";

export const STATE_LABEL: Record<NodeState, string> = {
  seeded: "Not started",
  explored: "Exploring",
  understood: "Explained",
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Peer names in history may carry a fixture marker, e.g. "Rhea (seed)". Learners see the name only. */
export function personName(s: string, names: Readonly<Record<string, string>> = {}): string {
  const name = names[s] ?? s;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) return "a peer";
  return name.replace(/\s*\((seed|demo)\)\s*$/i, "") || "a peer";
}

export function relTime(at: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
