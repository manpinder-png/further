import { FinishSessionRequest } from "@/lib/schemas";
import { adminRest, hasSupabase, requireSupabaseUser, userRpc } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = FinishSessionRequest.safeParse(await req.json().catch(() => null));
  if (!body.success || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid session" }, { status: 400 });
  if (!hasSupabase()) return Response.json({ error: "Live session unavailable" }, { status: 503 });
  try {
    const user = await requireSupabaseUser(req);
    const encoded = body.data.concepts.map((slug) => `slug.eq.${slug}`).join(",");
    const concepts = await (await adminRest(`concepts?or=(${encoded})&select=id,slug`)).json() as Array<{ id: string; slug: string }>;
    if (concepts.length !== body.data.concepts.length) return Response.json({ error: "Unknown session concept" }, { status: 404 });
    const result = await userRpc(user.token, "finish_learning_session", { p_session_id: id, p_concept_ids: concepts.map((c) => c.id), p_summary: body.data.summary });
    return Response.json({ ...result });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not finish session" }, { status: 401 });
  }
}
