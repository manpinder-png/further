import type { FEvent } from "../types";

/** Practice belongs to one saved lesson, never its replacement or an older depth-only event. */
export function lessonPracticeSaved(slug: string, runId: string | undefined, events: readonly FEvent[]): boolean {
  return Boolean(runId && events.some((event) => event.slug === slug && event.kind === "watch" && event.payload?.lessonRunId === runId));
}
