// F7: Presence-based matching. Production: a 15s server job reads the Supabase
// Presence channel `explorers`, scores present pairs, writes `match_requests`. Owner: Amit.
// This route runs the same scorer on demand so the UI and evals can call it.
import { z } from "zod";
import { MatchDecision } from "@/lib/schemas";
import { MATCH_THRESHOLD, scorePair } from "@/lib/matching";
import { CATALOG_EDGES, seedExplorers } from "@/lib/demo/seed";
import type { Edge, Explorer } from "@/lib/types";

export const dynamic = "force-dynamic";

const ScoreReq = z.object({
  me: z.object({
    activeConcepts: z.array(z.string().max(80)).max(5),
    mastery: z.record(z.string(), z.number().min(0).max(1)),
    openToMatch: z.boolean(),
    language: z.string().max(8),
  }),
  edges: z.array(z.object({ src: z.string(), dst: z.string(), kind: z.enum(["prerequisite", "related", "part_of"]) })).max(500).default([]),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const decision = MatchDecision.safeParse(body);
  if (decision.success) {
    // TODO(Amit): update match_requests.status; both accepted → create `sessions` row.
    return Response.json({ ok: true, status: decision.data.decision === "accept" ? "waiting" : "declined" });
  }
  const p = ScoreReq.safeParse(body);
  if (!p.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const now = Date.now();
  const me: Explorer = { id: "me", name: "You", demo: false, color: "#f26b1d", lastActive: now, ...p.data.me };
  const edges: Edge[] = [...CATALOG_EDGES, ...p.data.edges];
  const ranked = seedExplorers(now)
    .map((peer) => ({ peer, ...scorePair({ a: me, b: peer, edges, now }) }))
    .sort((x, y) => y.score - x.score);
  return Response.json({ threshold: MATCH_THRESHOLD, ranked, demo: true });
}
