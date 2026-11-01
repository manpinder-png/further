import { adminRest, hasSupabase, requireSupabaseUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

type DbConcept = { id: string; slug: string; title: string; summary: string | null; domain: string; cover_url: string | null };
type DbEdge = { src: string; dst: string; kind: "prerequisite" | "related" | "part_of" };
type DbEvent = { id: number; concept_id: string; kind: string; payload: Record<string, unknown> | null; created_at: string };

/** Hydrates an authenticated explorer from Postgres. The client falls back to
 * explicit seed data when Supabase or anonymous auth has not been enabled. */
export async function GET(req: Request) {
  if (!hasSupabase()) return Response.json({ error: "Supabase demo mode" }, { status: 503 });
  try {
    const user = await requireSupabaseUser(req);
    await adminRest("profiles?on_conflict=id", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: user.id, display_name: "Explorer" }),
    });
    const [conceptsRes, edgesRes, eventsRes, profileRes] = await Promise.all([
      adminRest("concepts?select=id,slug,title,summary,domain,cover_url"),
      adminRest("concept_edges?select=src,dst,kind"),
      adminRest(`events?user_id=eq.${encodeURIComponent(user.id)}&select=id,concept_id,kind,payload,created_at&order=created_at.asc`),
      adminRest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=display_name,static_profile,preferences,current_intent,open_to_match,language,is_adult&limit=1`),
    ]);
    const concepts = await conceptsRes.json() as DbConcept[];
    const idToSlug = new Map(concepts.map((c) => [c.id, c.slug]));
    const edges = await edgesRes.json() as DbEdge[];
    const events = await eventsRes.json() as DbEvent[];
    const profiles = await profileRes.json() as Array<{ display_name: string; static_profile: Record<string, unknown> | null; preferences: Record<string, unknown> | null; current_intent: string | null; open_to_match: boolean; language: string; is_adult: boolean }>;
    const p = profiles[0];
    return Response.json({
      mode: "live",
      concepts: concepts.map((c) => ({ slug: c.slug, title: c.title, hook: c.summary ?? "", domain: c.domain, coverUrl: c.cover_url ?? undefined })),
      edges: edges.map((e) => ({ src: idToSlug.get(e.src), dst: idToSlug.get(e.dst), kind: e.kind })).filter((e) => e.src && e.dst),
      events: events.map((e) => ({ id: e.id, slug: idToSlug.get(e.concept_id), kind: e.kind, payload: e.payload ?? undefined, at: Date.parse(e.created_at) })).filter((e) => e.slug),
      profile: p ? {
        displayName: p.display_name,
        staticProfile: { role: String(p.static_profile?.role ?? ""), background: String(p.static_profile?.background ?? ""), age18Plus: p.is_adult },
        preferences: { style: String(p.preferences?.style ?? ""), pace: String(p.preferences?.pace ?? ""), inferred: Boolean(p.preferences?.inferred) },
        currentIntent: p.current_intent ?? "",
        openToMatch: p.open_to_match,
        language: p.language,
      } : null,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not load account" }, { status: 401 });
  }
}
