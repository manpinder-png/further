// Live matching uses versioned semantic retrieval and the pure fit policy below.
// scorePair is retained for explicit legacy sample-mode compatibility.
import type { Edge, Explorer } from "./types";
import { EMBEDDING_MODEL, EMBEDDING_REVISION, EMBEDDING_REFERENCE_HASH } from "../domains/retrieval/space";

export const MATCH_THRESHOLD = 0.6;
export const HANDSHAKE_MS = 60_000;
const TEN_MIN = 10 * 60_000;

/**
 * Experimental operating point for the pinned, fixed-reference-centered space.
 * The 18-query smoke sets retain 15 labelled targets at this threshold; it is
 * deliberately more conservative than keeping all nearest-neighbor results.
 * This is a retrieval threshold, never a probability or knowledge assessment.
 * Re-evaluate this operating point when the encoder/revision changes.
 */
export const SEMANTIC_MIN_SIMILARITY = 0.55;
export const SEMANTIC_MATCHING_VERSION = "semantic-cosine-v1" as const;
/** Experimental, deterministic disclosure policy; never fitted to demo names. */
export const SEMANTIC_PAIR_BAND = 0.10;
export const SEMANTIC_PAIR_LIMIT = 3;

/** An operating point never transfers silently to a different encoder space. */
export function semanticOperatingPoint(model: string, revision: string): { minSimilarity: number; calibration: "experimental" } | null {
  // Freeze the evaluated transform, not merely the encoder's moving name. New
  // reference material or pooling needs an explicit evaluation/policy change.
  if (model === EMBEDDING_MODEL && revision === EMBEDDING_REVISION
    && revision.includes(":mean-mask-l2-refmean-l2-v2:")
    && EMBEDDING_REFERENCE_HASH === "ec1cadc28166e6bdc48d5248743ddc8c9cea8147f788e82fb02229a1d27588af") {
    return { minSimilarity: SEMANTIC_MIN_SIMILARITY, calibration: "experimental" };
  }
  return null;
}

export interface SemanticFit {
  semanticSimilarity: number;
  explanationEvidence: number;
  timeFit: number;
  score: number;
}

/** Pure, documented scoring after consent and availability have been checked. */
export function scoreSemanticFit(input: { similarity: number; ownExplanation: number; peerExplanation: number; ownMinutes: number; peerMinutes: number }): SemanticFit {
  const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const semanticSimilarity = clamp(input.similarity);
  // Reviewed explanation evidence can support an exchange. Missing evidence is
  // unknown, not a finding that someone lacks understanding or can teach.
  const explanationEvidence = Number(input.ownExplanation >= 2 / 3 || input.peerExplanation >= 2 / 3);
  const longer = Math.max(input.ownMinutes, input.peerMinutes);
  const timeFit = longer > 0 ? clamp(Math.min(input.ownMinutes, input.peerMinutes) / longer) : 0;
  return { semanticSimilarity, explanationEvidence, timeFit,
    score: .85 * semanticSimilarity + .1 * explanationEvidence + .05 * timeFit };
}

export interface PairInput {
  a: Explorer;
  b: Explorer;
  edges: Edge[];
  now: number;
  blocked?: boolean;
  declinedWithin24h?: boolean;
}

export interface PairScore {
  score: number;
  overlap: number;
  complementarity: number;
  recency: number;
  /** concept where one side is ahead: drives the "ahead on X" reason */
  teach?: { from: "a" | "b"; slug: string; near: string };
  filteredBy?: string;
}

function neighbours(slug: string, edges: Edge[]) {
  const s = new Set<string>([slug]);
  for (const e of edges) {
    if (e.src === slug) s.add(e.dst);
    if (e.dst === slug) s.add(e.src);
  }
  return s;
}

export function scorePair({ a, b, edges, now, blocked, declinedWithin24h }: PairInput): PairScore {
  const zero = { score: 0, overlap: 0, complementarity: 0, recency: 0 };
  if (!a.openToMatch || !b.openToMatch) return { ...zero, filteredBy: "not open to match" };
  if (a.language !== b.language) return { ...zero, filteredBy: "language" };
  if (blocked) return { ...zero, filteredBy: "blocked" };
  if (declinedWithin24h) return { ...zero, filteredBy: "declined in last 24h" };

  // Overlap coefficient on active concepts, weighted by rank (top = most interest).
  // Divides by the smaller side, not the union, so a big map isn't penalised
  // for matching a newer explorer's smaller one.
  const w = (list: string[], s: string) => {
    const i = list.indexOf(s);
    return i < 0 ? 0 : 1 - i * 0.12;
  };
  const sum = (l: string[]) => l.reduce((acc, s) => acc + w(l, s), 0);
  let inter = 0;
  for (const s of new Set([...a.activeConcepts, ...b.activeConcepts])) inter += Math.min(w(a.activeConcepts, s), w(b.activeConcepts, s));
  const denom = Math.min(sum(a.activeConcepts), sum(b.activeConcepts));
  const overlap = denom ? Math.min(1, inter / denom) : 0;

  // Complementarity: one side ≥ 0.6 mastery where the other ≤ 0.3, within 1 hop of shared work.
  let complementarity = 0;
  let teach: PairScore["teach"];
  const consider = (x: Explorer, y: Explorer, from: "a" | "b") => {
    for (const s of y.activeConcepts) {
      for (const n of neighbours(s, edges)) {
        if ((x.mastery[n] ?? 0) >= 0.6 && (y.mastery[n] ?? 0) <= 0.3) {
          complementarity = 1;
          teach ??= { from, slug: n, near: s };
        }
      }
    }
  };
  consider(a, b, "a");
  consider(b, a, "b");

  const recency = now - a.lastActive < TEN_MIN && now - b.lastActive < TEN_MIN ? 1 : 0;
  const score = 0.5 * overlap + 0.3 * complementarity + 0.2 * recency;
  return { score, overlap, complementarity, recency, teach };
}
