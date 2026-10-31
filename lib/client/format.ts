// Learner-facing wording in one place, so the map, rail, inspector and profile agree.
import type { NodeState } from "../types";

export const STATE_LABEL: Record<NodeState, string> = {
  seeded: "On your map",
  explored: "Explored",
  understood: "Understood",
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Peer names in history may carry a fixture marker, e.g. "Rhea (seed)". Learners see the name only. */
export const personName = (s: string) => s.replace(/\s*\((seed|demo)\)\s*$/i, "");

export function relTime(at: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
