import "server-only";
import { env } from "./config";

// Per-user LLM rate limit (E9: 30 expansions/hour). Owner: Connor.
// DEMO: in-memory sliding window, resets on deploy. Production: a Postgres table
// `rate_hits(user_id, bucket, at)` with a count over the last hour.
const hits = new Map<string, number[]>();

export function checkRate(userId: string, bucket = "expand") {
  const key = `${userId}:${bucket}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < 3_600_000);
  const limit = env.rateLimit;
  if (list.length >= limit) return { ok: false, remaining: 0, limit };
  list.push(now);
  hits.set(key, list);
  return { ok: true, remaining: limit - list.length, limit };
}
