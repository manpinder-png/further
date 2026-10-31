// Concept canonicalization (plan §5.2). Without it, "GPUs" and "graphics
// processors" become two concepts and matching breaks.
//
// Real path (Connor): embed the title with Meta embeddings or Supabase gte-small
// (384 dims), then `select ... order by embedding <=> $1 limit 1` in pgvector.
// Demo path: a hashed character-trigram vector plus a small alias table, so the
// UI can show reuse decisions offline. Labeled DEMO wherever it's surfaced.

export const SIMILARITY_THRESHOLD = 0.88; // tune with the eval set
export const DIMS = 384;

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(the|a|an|of|and|what|is|s)\b/g, " ")
    .replace(/s\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function demoEmbed(title: string): Float32Array {
  const v = new Float32Array(DIMS);
  const t = ` ${norm(title)} `;
  for (let i = 0; i < t.length - 2; i++) v[hash(t.slice(i, i + 3)) % DIMS] += 1;
  return v;
}

/** Demo-only synonyms standing in for what a real embedding model knows. */
const ALIASES: Record<string, string> = {
  "graphics processor": "gpu",
  "graphics processing unit": "gpu",
  "graphics card": "gpu",
  "gpu": "gpu",
  "matmul": "matrix-multiplication",
  "high bandwidth memory": "hbm",
  "hbm memory": "hbm",
  "hbm": "hbm",
  "floating point": "floating-point",
};

export interface CanonicalHit {
  slug: string;
  similarity: number;
}

export function canonicalize(
  title: string,
  existing: { slug: string; title: string }[],
): CanonicalHit | null {
  const n = norm(title);
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (n === alias || n.includes(alias)) {
      if (existing.some((e) => e.slug === target)) return { slug: target, similarity: 0.94 };
    }
  }
  const q = demoEmbed(title);
  let best: CanonicalHit | null = null;
  for (const e of existing) {
    const s = cosine(q, demoEmbed(e.title));
    if (!best || s > best.similarity) best = { slug: e.slug, similarity: s };
  }
  return best && best.similarity >= SIMILARITY_THRESHOLD ? best : null;
}

export const toSlug = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "concept";
