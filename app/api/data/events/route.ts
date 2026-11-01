import { LearningEventRequest } from "@/lib/schemas";
import { adminRest, hasSupabase, requireSupabaseUser, userRpc } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = LearningEventRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid learning event" }, { status: 400 });
  if (!hasSupabase()) return Response.json({ error: "Supabase demo mode" }, { status: 503 });
  try {
    const user = await requireSupabaseUser(req);
    const concepts = await (await adminRest(`concepts?slug=eq.${encodeURIComponent(parsed.data.slug)}&select=id&limit=1`)).json() as Array<{ id: string }>;
    if (!concepts[0]) return Response.json({ error: "Unknown concept" }, { status: 404 });
    const node = await userRpc(user.token, "record_learning_event", {
      p_concept_id: concepts[0].id,
      p_kind: parsed.data.kind,
      p_payload: parsed.data.payload ?? {},
    });
    return Response.json({ node });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not save event" }, { status: 401 });
  }
}
