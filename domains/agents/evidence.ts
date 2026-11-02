import type { Concept, FEvent } from "../../lib/types.ts";

/** Owner-scoped observations for model context, not a model of someone's ability. */
export function learningEvidence(concepts: Pick<Concept, "slug" | "title">[], events: FEvent[]) {
  return {
    interpretation: "These are recorded activities and AI feedback on individual answers, not verified mastery, intelligence, fixed learning styles, or readiness to teach. A completed source or peer session records participation only. Use the latest relevant explanation to suggest one useful practice step.",
    concepts: concepts.slice(-100).map(concept => {
      const own = events.filter(event => event.slug === concept.slug).sort((a, b) => b.at - a.at);
      const explanations = own.filter(event => event.kind === "explain" && Number.isInteger(event.payload?.score) && Number(event.payload?.score) >= 0 && Number(event.payload?.score) <= 3);
      const latest = explanations[0];
      return {
        slug: concept.slug, title: concept.title,
        opened: own.some(event => event.kind === "open"),
        completedSources: own.filter(event => event.kind === "watch").length,
        peerSessions: own.filter(event => event.kind === "session").length,
        lastActivityAt: own[0] ? new Date(own[0].at).toISOString() : null,
        explanationAttempts: explanations.length,
        latestExplanation: latest ? {
          at: new Date(latest.at).toISOString(),
          score: Number(latest.payload!.score), outOf: 3,
          feedback: typeof latest.payload?.feedback === "string" ? latest.payload.feedback.slice(0,500) : null,
          assessment: "AI feedback on this answer only",
        } : null,
      };
    }),
  };
}
