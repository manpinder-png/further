// Review: forward-looking use of the learner's own history. Pure functions shared by
// the Review panel and tests. Nothing here claims mastery; "explained" means an
// AI-reviewed explanation exists, and "slipping" means time has passed since then.
import type { Concept, FEvent, UserNode } from "./types";
import type { LearningPath } from "./client/learning-paths";

const DAY = 86_400_000;
/** Days of silence after an explanation before a concept is worth revisiting. */
export const SLIPPING_AFTER_DAYS = 4;

export interface SlippingConcept { slug: string; title: string; explainedAt: number; lastTouched: number; daysSince: number }

/** Explained, then untouched for a while: the best candidates for explaining again. */
export function slippingConcepts(nodes: Record<string, UserNode>, events: readonly FEvent[], concepts: Record<string, Concept>, now = Date.now()): SlippingConcept[] {
  const explained = new Map<string, number>();
  for (const event of events) if (event.kind === "explain" && typeof event.payload?.score === "number") explained.set(event.slug, Math.max(explained.get(event.slug) ?? 0, event.at));
  const out: SlippingConcept[] = [];
  for (const [slug, explainedAt] of explained) {
    const node = nodes[slug], concept = concepts[slug];
    if (!node || !concept) continue;
    const daysSince = Math.floor((now - node.lastTouched) / DAY);
    if (daysSince >= SLIPPING_AFTER_DAYS) out.push({ slug, title: concept.title, explainedAt, lastTouched: node.lastTouched, daysSince });
  }
  return out.sort((a, b) => b.daysSince - a.daysSince || a.title.localeCompare(b.title));
}

export interface WeekCounts { added: number; opened: number; explained: number; sourcesRead: number; sessions: number }
export interface WeeklyRecap { thisWeek: WeekCounts; lastWeek: WeekCounts }

/** Counts for the last seven days and the seven before, from the event log alone. */
export function weeklyRecap(events: readonly FEvent[], now = Date.now()): WeeklyRecap {
  const count = (from: number, to: number): WeekCounts => {
    const inWindow = events.filter(event => event.at >= from && event.at < to);
    const distinct = (kind: FEvent["kind"]) => new Set(inWindow.filter(event => event.kind === kind).map(event => event.slug)).size;
    const sessions = new Set(inWindow.filter(event => event.kind === "session").map(event => String(event.payload?.sessionId ?? `${String(event.payload?.with ?? "")}|${Math.round(event.at / 60_000)}`))).size;
    return { added: distinct("seed"), opened: distinct("open"), explained: distinct("explain"), sourcesRead: distinct("watch"), sessions };
  };
  return { thisWeek: count(now - 7 * DAY, now + 1), lastWeek: count(now - 14 * DAY, now - 7 * DAY) };
}

export interface ResumePoint { key: string; question: string; total: number; opened: number; explained: number; lastTouched: number; nextSlug: string | null; nextTitle: string | null }

/** Questions with work left, most recently touched first, each with the concept to pick up. */
export function resumePoints(paths: readonly LearningPath[], nodes: Record<string, UserNode>, events: readonly FEvent[], concepts: Record<string, Concept>): ResumePoint[] {
  const explainedSlugs = new Set(events.filter(event => event.kind === "explain" && typeof event.payload?.score === "number").map(event => event.slug));
  const out: ResumePoint[] = [];
  for (const path of paths) {
    if (path.key === "saved-topics") continue;
    const slugs = path.slugs.filter(slug => concepts[slug]);
    if (!slugs.length) continue;
    const opened = slugs.filter(slug => nodes[slug] && nodes[slug].state !== "seeded");
    const explained = slugs.filter(slug => explainedSlugs.has(slug));
    if (explained.length === slugs.length) continue;
    const lastTouched = Math.max(path.at, ...slugs.map(slug => nodes[slug]?.lastTouched ?? 0));
    // Pick up the most recently touched unfinished concept; otherwise the first untouched step.
    const unfinished = slugs.filter(slug => !explainedSlugs.has(slug));
    const recent = [...unfinished].filter(slug => nodes[slug] && nodes[slug].state !== "seeded").sort((a, b) => (nodes[b]?.lastTouched ?? 0) - (nodes[a]?.lastTouched ?? 0))[0];
    const nextSlug = recent ?? unfinished[0] ?? null;
    out.push({ key: path.key, question: path.question, total: slugs.length, opened: opened.length, explained: explained.length, lastTouched, nextSlug, nextTitle: nextSlug ? concepts[nextSlug]?.title ?? null : null });
  }
  return out.sort((a, b) => b.lastTouched - a.lastTouched);
}

export interface ExplanationAttempt { at: number; score: number; feedback: string | null }

/** Every reviewed explanation of one concept, oldest first. */
export function explanationAttempts(slug: string, events: readonly FEvent[]): ExplanationAttempt[] {
  return events.filter(event => event.slug === slug && event.kind === "explain" && typeof event.payload?.score === "number")
    .map(event => ({ at: event.at, score: event.payload!.score as number, feedback: typeof event.payload?.feedback === "string" ? event.payload.feedback : null }))
    .sort((a, b) => a.at - b.at);
}
