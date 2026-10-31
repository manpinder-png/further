// Bloom and fade math (plan §5.4). Pure functions shared by the map, the
// time-lapse replay and (later) the server. Keep this the single source of truth.
import type { EventKind, FEvent, NodeState, UserNode } from "./types";

export const HALF_LIFE_HOURS = 72; // interest decays with a 3-day half-life
export const UNDERSTOOD_AT = 0.7; // mastery at which a node becomes "understood" (our choice, tune with evals)

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
      mastery += 0.2;
      break;
    case "explain": {
      const score = Number(ev.payload?.score ?? 0);
      mastery += (Math.max(0, Math.min(3, score)) / 3) * 0.5;
      interest += 0.1;
      break;
    }
    case "session":
      mastery += 0.2;
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
export const opacityFor = (interest: number) => 0.25 + 0.75 * clamp(interest);
/** Block size in tiles: 1 → 2 as mastery grows. */
export const sizeFor = (mastery: number) => (mastery >= 0.45 ? 2 : 1);
/** Fog-of-war reveal radius in tiles. */
export const revealFor = (n: UserNode) => 2 + n.interest * 3 + n.mastery * 2;

/** Current interest after decay, for display. */
export function liveInterest(n: UserNode, now = Date.now()) {
  return decayInterest(n.interest, now - n.lastTouched);
}
