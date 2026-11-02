// How Muse learns how you learn (plan §5.1 profile layers, §5.4 math).
// Pure heuristics over the event log; the live path also asks Muse Spark to
// narrate this profile (see /api/course). Never a quiz, never a score shown
// as a grade — it only changes what Muse builds next for you.
import type { FEvent, UserNode } from "./types";

// Same 3-day half-life as lib/math.ts decayInterest (inlined so this module
// stays importable by the plain Node test runner).
const liveInterest = (n: UserNode, now: number) => n.interest * Math.pow(0.5, Math.max(0, now - n.lastTouched) / 3_600_000 / 72);

export interface LearnerModel {
  /** Concepts Muse should build on (mastery >= 0.4), freshest first. */
  strengths: string[];
  /** On the map but fading — candidates for a refresher, not new material. */
  fading: string[];
  /** Seeded but untouched — the frontier Muse expands from. */
  frontier: string[];
  style: "visual-first" | "explain-back" | "read-first" | "balanced";
  pace: "short-bursts" | "deep-dives" | "steady";
  /** Teaching formats this user finishes vs skips — Muse picks from these. */
  formatAffinity: Record<string, { done: number; skipped: number }>;
  /** Formats ranked by evidence (finished − skipped), best first. */
  bestFormats: string[];
  /** One human sentence Muse uses to adapt tone/depth. Sent to the model. */
  summary: string;
}

export function learnerModel(nodes: Record<string, UserNode>, events: FEvent[], now = Date.now()): LearnerModel {
  const all = Object.values(nodes);
  const strengths = all.filter((n) => n.mastery >= 0.4).sort((a, b) => b.lastTouched - a.lastTouched).map((n) => n.slug);
  const fading = all.filter((n) => liveInterest(n, now) < 0.35 && n.mastery < 0.7).map((n) => n.slug);
  const frontier = all.filter((n) => n.state === "seeded").sort((a, b) => liveInterest(b, now) - liveInterest(a, now)).map((n) => n.slug);

  const explains = events.filter((e) => e.kind === "explain");
  const avgScore = explains.length ? explains.reduce((s, e) => s + Number(e.payload?.score ?? 0), 0) / explains.length : 0;
  const watches = events.filter((e) => e.kind === "watch").length;
  const opens = events.filter((e) => e.kind === "open").length;
  const dwells = events.filter((e) => e.kind === "dwell").length;

  const style: LearnerModel["style"] =
    explains.length >= 2 && avgScore >= 2 ? "explain-back" : watches >= 3 ? "visual-first" : opens >= 5 && dwells < 2 ? "read-first" : "balanced";
  const pace: LearnerModel["pace"] = dwells >= 3 ? "deep-dives" : opens >= 6 ? "short-bursts" : "steady";

  // Format affinities: every finished/skipped teaching moment is evidence.
  // This is the feed learning the user, like a recommender — but for teaching.
  const formatAffinity: LearnerModel["formatAffinity"] = {};
  for (const e of events) {
    const format = typeof e.payload?.format === "string" ? e.payload.format : null;
    if (!format) continue;
    formatAffinity[format] ??= { done: 0, skipped: 0 };
    if (e.kind === "watch" || e.kind === "explain" || e.kind === "session") formatAffinity[format].done++;
    if (e.kind === "skip") formatAffinity[format].skipped++;
  }
  const bestFormats = Object.entries(formatAffinity)
    .sort((a, b) => b[1].done - b[1].skipped - (a[1].done - a[1].skipped))
    .map(([f]) => f);
  const formatLine = bestFormats.length
    ? `Teaching formats: ${Object.entries(formatAffinity).map(([f, v]) => `${f} finished ${v.done}×, skipped ${v.skipped}×`).join("; ")}. Lean into what they finish; stop serving what they skip.`
    : "No teaching-format evidence yet — vary formats and watch what lands.";

  const summary =
    `Prior explanation practice: ${strengths.slice(0, 3).join(", ") || "none yet"}; not verified mastery. ` +
    `Less recently active: ${fading.slice(0, 3).join(", ") || "none"}; inactivity does not establish forgetting. ` +
    `Tentative activity pattern: ${style}, pace ${pace}; do not treat this as a fixed learning style. ` +
    (avgScore ? `AI feedback average ${avgScore.toFixed(1)}/3 — try ${avgScore >= 2 ? "a deeper mechanism or transfer example" : "a gentler worked example"}, then check the learner's own reasoning. ` : "No explain-backs yet — keep the first one inviting. ") +
    formatLine;

  return { strengths, fading, frontier, style, pace, formatAffinity, bestFormats, summary };
}
