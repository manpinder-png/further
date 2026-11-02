import type { Concept, Edge, FEvent } from "../types";
import type { Mission } from "../../domains/ui/contracts";

export interface LearningPath {
  key: string;
  question: string;
  slugs: string[];
  at: number;
}

/** A question owns a view of its concepts. Starting another question never merges its view. */
export function learningPaths(missions: readonly Mission[], concepts: Record<string, Concept>): LearningPath[] {
  const paths = missions.filter((m) => m.status === "done" && m.slugs?.some((slug) => concepts[slug]))
    .sort((a, b) => b.at - a.at || b.id - a.id)
    .map((m) => ({ key: m.runId ?? String(m.id), question: m.text, slugs: [...new Set(m.slugs)].filter((slug) => concepts[slug]), at: m.at }));
  const assigned = new Set(paths.flatMap((p) => p.slugs));
  const unassigned = Object.keys(concepts).filter((slug) => !assigned.has(slug));
  if (unassigned.length) paths.push({ key: "saved-topics", question: "Saved topics", slugs: unassigned, at: 0 });
  return paths;
}

/** Stable prerequisite ordering, scoped to this question; cycles preserve the model's order. */
export function orderPath(slugs: readonly string[], edges: readonly Edge[]): string[] {
  const included = new Set(slugs);
  const pending = [...new Set(slugs)];
  const ordered: string[] = [];
  while (pending.length) {
    const index = pending.findIndex((slug) => !edges.some((e) => e.kind === "prerequisite" && e.dst === slug && e.src !== slug && included.has(e.src) && !ordered.includes(e.src)));
    if (index === -1) { ordered.push(...pending); break; }
    ordered.push(pending.splice(index, 1)[0]);
  }
  return ordered;
}

export function explanationFor(slug: string, events: readonly FEvent[]): FEvent | undefined {
  return [...events].reverse().find((e) => e.slug === slug && e.kind === "explain" && typeof e.payload?.score === "number");
}
