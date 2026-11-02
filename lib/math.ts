// Bloom and fade math (plan §5.4). Pure functions shared by the map, the
// time-lapse replay and (later) the server. Keep this the single source of truth.
import type { EventKind, FEvent, NodeState, UserNode } from "./types";

export const HALF_LIFE_HOURS = 72; // interest decays with a 3-day half-life
// Legacy field/state names remain compatible with saved events. This value now
// represents the best AI-reviewed explanation, not validated human mastery.
// The UI calls the state "Explained". Attendance and viewing cannot earn it.
export const UNDERSTOOD_AT = 1;

const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function decayInterest(interest: number, msSinceTouched: number): number {
  const hours = Math.max(0, msSinceTouched) / 3_600_000;
  return interest * Math.pow(0.5, hours / HALF_LIFE_HOURS);
}

export function stateFor(mastery: number, prev: NodeState, kind?: EventKind): NodeState {
  if (mastery >= UNDERSTOOD_AT) return "understood";
  if (prev === "seeded" && kind && kind !== "seed" && kind !== "skip") return "explored";
  return prev;
}

/** Apply one event to a node. Returns a new node; never mutates. */
export function applyEvent(node: UserNode | undefined, ev: FEvent): UserNode {
  const base: UserNode = node
    ? { ...node, interest: decayInterest(node.interest, ev.at - node.lastTouched) }
    : { slug: ev.slug, interest: 0.5, mastery: 0, state: "seeded", lastTouched: ev.at };

  let { interest, mastery } = base;
  switch (ev.kind) {
    case "seed":
      break;
    case "open":
      interest += 0.3;
      break;
    case "dwell":
      interest += 0.2;
      break;
    case "skip":
      interest -= 0.3;
      break;
    case "watch":
      interest += 0.1;
      break;
    case "explain": {
      const raw = Number(ev.payload?.score ?? 0);
      const score = Number.isFinite(raw) ? Math.max(0, Math.min(3, raw)) : 0;
      // Repeating a partial answer must never accumulate into a full result.
      mastery = Math.max(mastery, score / 3);
      interest += 0.1;
      break;
    }
    case "session":
      interest += 0.2;
      break;
  }
  interest = clamp(interest);
  mastery = clamp(mastery);
  return {
    ...base,
    interest,
    mastery,
    state: stateFor(mastery, base.state, ev.kind),
    lastTouched: ev.at,
    learnedWith: (ev.payload?.with as string) ?? base.learnedWith,
  };
}

/** Replay events up to `until` (time-lapse, plan §5.4: no extra storage needed). */
export function replay(events: FEvent[], until = Infinity): Record<string, UserNode> {
  const out: Record<string, UserNode> = {};
  for (const ev of events) {
    if (ev.at > until) break;
    out[ev.slug] = applyEvent(out[ev.slug], ev);
  }
  return out;
}

/** Rendering rules. */
export const opacityFor = (interest: number) => 0.18 + 0.82 * clamp(interest);

/** Current interest after decay, for display. */
export function liveInterest(n: UserNode, now = Date.now()) {
  return decayInterest(n.interest, now - n.lastTouched);
}
