// The map learning from you (DESIGN D36). Pure functions over the event log:
// level/XP, suggested next topics, and an ordered path. Ideas from Connor's learner
// model (feature/connor-live-backend: lib/learn.ts): strengths, fading, frontier,
// and "stop serving what they skip".
// TODO(Connor): in live mode, send learnerSummary() to /api/course and let Muse Spark
// pick suggestions and write the reasons. These heuristics are the demo stand-in.
import type { Concept, Edge, EdgeKind, FEvent, UserNode } from "./types";
import { CATALOG, NEAR, RESOURCES } from "./demo/seed";
import { liveInterest } from "./math";

/* ---------- Level and XP ---------- */

const XP_STEP = 40;
export function progressFor(nodes: Record<string, UserNode>) {
  const list = Object.values(nodes);
  const xp = Math.round(list.reduce((s, n) => s + n.mastery * 100 + (n.state === "understood" ? 50 : 0), 0));
  const level = Math.floor(Math.sqrt(xp / XP_STEP)) + 1;
  const floor = XP_STEP * (level - 1) ** 2;
  const next = XP_STEP * level ** 2;
  return { xp, level, floor, next, frac: (xp - floor) / Math.max(1, next - floor) };
}

/* ---------- How you learn ---------- */

export function learnerStyle(events: FEvent[]) {
  const watches = events.filter((e) => e.kind === "watch").length;
  const explains = events.filter((e) => e.kind === "explain").length;
  return { visual: watches >= 3, explains };
}

/* ---------- Suggested next topics ---------- */

export interface Suggestion {
  slug: string;
  title: string;
  hook: string;
  anchor: string;
  kind: EdgeKind;
  reason: string;
  score: number;
}

/** Where each catalog topic attaches. Demo stand-in for the model's graph. */
const LINKS: Record<string, { from: string; kind: EdgeKind }> = {
  ...NEAR,
  "ai-accelerators": { from: "training-vs-inference", kind: "related" },
  "matrix-multiplication": { from: "neural-networks", kind: "part_of" },
  gpu: { from: "training-vs-inference", kind: "related" },
  "parallel-computing": { from: "gpu", kind: "related" },
  cuda: { from: "gpu", kind: "related" },
  "memory-bandwidth": { from: "gpu", kind: "related" },
  "tensor-cores": { from: "matrix-multiplication", kind: "part_of" },
};

export function suggestNext(
  concepts: Record<string, Concept>,
  nodes: Record<string, UserNode>,
  events: FEvent[],
  dismissed: string[] = [],
  now = Date.now(),
  max = 3,
): Suggestion[] {
  const { visual } = learnerStyle(events);
  const out: Suggestion[] = [];
  for (const [slug, link] of Object.entries(LINKS)) {
    if (concepts[slug] || nodes[slug] || dismissed.includes(slug)) continue;
    const anchor = nodes[link.from];
    if (!anchor || !concepts[link.from] || anchor.state === "seeded") continue;
    const c = CATALOG[slug];
    if (!c) continue;
    const anchorTitle = concepts[link.from].title;
    const video = RESOURCES[slug]?.kind === "video";
    const reason =
      visual && video
        ? "You finish videos, and there's a good one on this."
        : anchor.state === "understood"
          ? `You understood ${anchorTitle}. This builds on it.`
          : `Next to ${anchorTitle}, which you've been exploring.`;
    const score = anchor.mastery * 0.6 + liveInterest(anchor, now) * 0.4 + (visual && video ? 0.1 : 0);
    out.push({ slug, title: c.title, hook: c.hook, anchor: link.from, kind: link.kind, reason, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

/* ---------- Your path ---------- */

export interface PathStep {
  slug: string;
  title: string;
  kind: "finish" | "ready" | "revisit" | "suggested";
  reason: string;
}

export function pathFor(
  concepts: Record<string, Concept>,
  edges: Edge[],
  nodes: Record<string, UserNode>,
  suggestions: Suggestion[],
  now = Date.now(),
): PathStep[] {
  const title = (s: string) => concepts[s]?.title ?? CATALOG[s]?.title ?? s;
  const list = Object.values(nodes).filter((n) => concepts[n.slug]);

  const finish: PathStep[] = list
    .filter((n) => n.state === "explored" && liveInterest(n, now) >= 0.35)
    .sort((a, b) => b.mastery - a.mastery)
    .map((n) => ({ slug: n.slug, title: title(n.slug), kind: "finish" as const, reason: n.mastery >= 0.2 ? "Explain it back to finish" : "Watch the source to go deeper" }));

  const ready: PathStep[] = list
    .filter((n) => n.state === "seeded")
    .map((n) => ({ n, from: edges.find((e) => e.dst === n.slug && nodes[e.src] && nodes[e.src].state !== "seeded") }))
    .filter((x) => x.from)
    .sort((a, b) => liveInterest(b.n, now) - liveInterest(a.n, now))
    .map(({ n, from }) => ({ slug: n.slug, title: title(n.slug), kind: "ready" as const, reason: `Builds on ${title(from!.src)}` }));

  const revisit: PathStep[] = list
    .filter((n) => n.state === "explored" && liveInterest(n, now) < 0.35)
    .map((n) => ({ slug: n.slug, title: title(n.slug), kind: "revisit" as const, reason: "Fading. A quick look brings it back" }));

  const sugg: PathStep[] = suggestions.map((s) => ({ slug: s.slug, title: s.title, kind: "suggested" as const, reason: s.reason }));

  const picks = [finish[0], ready[0], sugg[0], finish[1], ready[1], revisit[0], sugg[1]].filter(Boolean) as PathStep[];
  const seen = new Set<string>();
  return picks.filter((p) => (seen.has(p.slug) ? false : (seen.add(p.slug), true))).slice(0, 5);
}
