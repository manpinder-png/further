// Real-time match scoring (plan §5.5). Pure: the 15s server job (Amit) calls
// scorePair for each present pair; the UI uses the same breakdown to explain a match.
import type { Edge, Explorer } from "./types";

export const MATCH_THRESHOLD = 0.6;
export const HANDSHAKE_MS = 60_000;
const TEN_MIN = 10 * 60_000;

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
