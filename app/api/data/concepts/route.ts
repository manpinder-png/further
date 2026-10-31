import { PersistConceptRequest } from "@/lib/schemas";
import { adminRest, hasSupabase, requireSupabaseUser, userRpc } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
type Row = { id: string; slug: string };

const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Server-only global graph write. Authenticated users may suggest a concept;
 * the service key performs the shared-graph write after input validation. */
export async function POST(req: Request) {
  const parsed = PersistConceptRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid concept" }, { status: 400 });
  if (!hasSupabase()) return Response.json({ error: "Supabase demo mode" }, { status: 503 });
  try {
    const user = await requireSupabaseUser(req);
    const { concept, edge } = parsed.data;
    let rows = await (await adminRest(`concepts?slug=eq.${encodeURIComponent(concept.slug)}&select=id,slug&limit=1`)).json() as Row[];
    if (!rows[0]) {
      const inserted = await adminRest("concepts", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({ slug: concept.slug, title: concept.title, summary: concept.hook, domain: concept.domain }),
      });
      rows = await inserted.json() as Row[];
      await adminRest("concept_aliases?on_conflict=normalized_title", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ normalized_title: normalized(concept.title), concept_id: rows[0].id, source: "model" }),
      });
    }
    if (edge && edge.from !== concept.slug) {
      const parents = await (await adminRest(`concepts?slug=eq.${encodeURIComponent(edge.from)}&select=id&limit=1`)).json() as Row[];
      if (parents[0]) await adminRest("concept_edges?on_conflict=src,dst,kind", {
        method: "POST",
        headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ src: parents[0].id, dst: rows[0].id, kind: edge.kind }),
      });
    }
    await userRpc(user.token, "record_learning_event", { p_concept_id: rows[0].id, p_kind: "seed", p_payload: {} });
    return Response.json({ id: rows[0].id, slug: concept.slug });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not persist concept" }, { status: 401 });
  }
}
