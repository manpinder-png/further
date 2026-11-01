// F7: Presence-based matching. Production: a 15s server job reads the Supabase
// Presence channel `explorers`, scores present pairs, writes `match_requests`. Owner: Amit.
// This route runs the same scorer on demand so the UI and evals can call it.
import { z } from "zod";
import { MatchDecision, PresenceSnapshot } from "@/lib/schemas";
import { MATCH_THRESHOLD, scorePair } from "@/lib/matching";
import { CATALOG_EDGES, seedExplorers } from "@/lib/demo/seed";
import type { Edge, Explorer } from "@/lib/types";
import { adminRest, hasSupabase, requireSupabaseUser, userRpc } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const ScoreReq = z.object({
  me: PresenceSnapshot,
  edges: z.array(z.object({ src: z.string(), dst: z.string(), kind: z.enum(["prerequisite", "related", "part_of"]) })).max(500).default([]),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const decision = MatchDecision.safeParse(body);
  if (decision.success) {
    if (hasSupabase() && req.headers.get("authorization")) {
      try {
        const user = await requireSupabaseUser(req);
        const result = await userRpc(user.token, "answer_match_request", { p_request_id: decision.data.requestId, p_decision: decision.data.decision });
        return Response.json({ ok: true, ...result, demo: false });
      } catch (err) {
        return Response.json({ error: err instanceof Error ? err.message : "Could not answer match" }, { status: 401 });
      }
    }
    return Response.json({ ok: true, status: decision.data.decision === "accept" ? "waiting" : "declined", demo: true });
  }
  const p = ScoreReq.safeParse(body);
  if (!p.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (hasSupabase() && req.headers.get("authorization")) return liveMatch(req, p.data.me, p.data.edges);
  const now = Date.now();
  const me: Explorer = { id: "me", name: "You", demo: false, color: "#f26b1d", lastActive: now, ...p.data.me };
  const edges: Edge[] = [...CATALOG_EDGES, ...p.data.edges];
  const ranked = seedExplorers(now)
    .map((peer) => ({ peer, ...scorePair({ a: me, b: peer, edges, now }) }))
    .sort((x, y) => y.score - x.score);
  return Response.json({ threshold: MATCH_THRESHOLD, ranked, demo: true });
}

/** Polling fallback for the two-way handshake. Supabase Broadcast can replace
 * this without changing the match contract; polling keeps the path functional
 * in the minimal dependency-free build. */
export async function GET(req: Request) {
  if (!hasSupabase()) return Response.json({ error: "Supabase demo mode" }, { status: 503 });
  const id = new URL(req.url).searchParams.get("requestId");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid request id" }, { status: 400 });
  try {
    const user = await requireSupabaseUser(req);
    const rows = await (await adminRest(`match_requests?id=eq.${id}&select=id,from_user,to_user,status,expires_at,concept_id`)).json() as Array<{ id: string; from_user: string; to_user: string; status: "pending" | "accepted" | "declined" | "expired"; expires_at: string; concept_id: string }>;
    const match = rows[0];
    if (!match || (match.from_user !== user.id && match.to_user !== user.id)) return Response.json({ error: "Match not found" }, { status: 404 });
    if (match.status === "pending" && Date.parse(match.expires_at) <= Date.now()) {
      await adminRest(`match_requests?id=eq.${id}&status=eq.pending`, { method: "PATCH", body: JSON.stringify({ status: "expired" }) });
      match.status = "expired";
    }
    const sessions = match.status === "accepted" ? await (await adminRest(`sessions?concept_id=eq.${match.concept_id}&select=id,started_at&order=started_at.desc&limit=5`)).json() as Array<{ id: string }> : [];
    return Response.json({ status: match.status, sessionId: sessions[0]?.id ?? null, expiresAt: Date.parse(match.expires_at) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not read match" }, { status: 401 });
  }
}

async function liveMatch(req: Request, mine: z.infer<typeof PresenceSnapshot>, suppliedEdges: Edge[]) {
  try {
    const user = await requireSupabaseUser(req);
    await adminRest("explorer_presence?on_conflict=user_id", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: user.id, active_concepts: mine.activeConcepts, mastery: mine.mastery, language: mine.language, open_to_match: mine.openToMatch, last_active: new Date().toISOString() }),
    });
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const rows = await (await adminRest(`explorer_presence?user_id=neq.${encodeURIComponent(user.id)}&last_active=gte.${encodeURIComponent(since)}&select=user_id,active_concepts,mastery,language,open_to_match,last_active`)).json() as Array<{ user_id: string; active_concepts: string[]; mastery: Record<string, number>; language: string; open_to_match: boolean; last_active: string }>;
    const ids = rows.map((r) => r.user_id);
    const profiles = ids.length ? await (await adminRest(`profiles?id=in.(${ids.join(",")})&select=id,display_name,is_adult`)).json() as Array<{ id: string; display_name: string; is_adult: boolean }> : [];
    const names = new Map(profiles.map((p) => [p.id, p.display_name]));
    const adults = new Map(profiles.map((p) => [p.id, p.is_adult]));
    const own = await (await adminRest(`profiles?id=eq.${user.id}&select=is_adult&limit=1`)).json() as Array<{ is_adult: boolean }>;
    if (!own[0]?.is_adult) return Response.json({ error: "Confirm that you are 18 or older before matching." }, { status: 403 });
    const now = Date.now();
    const me: Explorer = { id: user.id, name: "You", demo: false, color: "#f26b1d", lastActive: now, ...mine };
    const edges = [...CATALOG_EDGES, ...suppliedEdges];
    const ranked = rows.filter((r) => adults.get(r.user_id)).map((r, i) => {
      const peer: Explorer = { id: r.user_id, name: names.get(r.user_id) ?? "Explorer", demo: false, color: ["#4ddfe6", "#b58cff", "#86d36b"][i % 3], activeConcepts: r.active_concepts, mastery: r.mastery, language: r.language, openToMatch: r.open_to_match, lastActive: Date.parse(r.last_active) };
      return { peer, ...scorePair({ a: me, b: peer, edges, now }) };
    }).sort((a, b) => b.score - a.score);
    const best = ranked.find((r) => r.score >= MATCH_THRESHOLD && r.teach);
    if (!best) return Response.json({ threshold: MATCH_THRESHOLD, ranked, demo: false });
    const shared = best.peer.activeConcepts.find((s) => mine.activeConcepts.includes(s)) ?? best.peer.activeConcepts[0];
    const concepts = await (await adminRest(`concepts?slug=eq.${encodeURIComponent(shared)}&select=id&limit=1`)).json() as Array<{ id: string }>;
    if (!concepts[0]) return Response.json({ threshold: MATCH_THRESHOLD, ranked, demo: false });
    const strong = best.teach!.from === "b" ? best.teach!.slug : Object.entries(best.peer.mastery).sort((a, b) => b[1] - a[1])[0]?.[0] ?? shared;
    // Both phones run this endpoint. Reuse a still-valid request in either
    // direction so two simultaneous heartbeats cannot create two handshakes.
    type PendingRequest = { id: string; from_user: string; to_user: string; expires_at: string };
    const pending = await (await adminRest(`match_requests?status=eq.pending&or=(from_user.eq.${user.id},to_user.eq.${user.id})&select=id,from_user,to_user,expires_at`)).json() as PendingRequest[];
    let request: PendingRequest | undefined = pending.find((r) => Date.parse(r.expires_at) > now && ((r.from_user === user.id && r.to_user === best.peer.id) || (r.from_user === best.peer.id && r.to_user === user.id)));
    if (!request) {
      const inserted = await adminRest("match_requests", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({ from_user: user.id, to_user: best.peer.id, concept_id: concepts[0].id, reason: `${best.peer.name} is ahead on ${strong.replace(/-/g, " ")}`, score: best.score }),
      });
      request = (await inserted.json() as PendingRequest[])[0];
    }
    return Response.json({ threshold: MATCH_THRESHOLD, ranked, match: request ? { id: request.id, peer: best.peer, concept: shared, peerStrong: strong, score: best.score, reason: `${best.peer.name} is exploring ${shared.replace(/-/g, " ")} right now and is ahead on ${strong.replace(/-/g, " ")}.`, expiresAt: Date.parse(request.expires_at), status: "pending" } : null, demo: false });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Live matching failed" }, { status: 401 });
  }
}
