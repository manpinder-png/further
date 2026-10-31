import { ProfileUpdateRequest } from "@/lib/schemas";
import { adminRest, hasSupabase, requireSupabaseUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const parsed = ProfileUpdateRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid profile" }, { status: 400 });
  if (!hasSupabase()) return Response.json({ error: "Supabase demo mode" }, { status: 503 });
  try {
    const user = await requireSupabaseUser(req);
    const p = parsed.data;
    await adminRest(`profiles?id=eq.${user.id}`, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({ display_name: p.displayName, static_profile: { role: p.staticProfile.role, background: p.staticProfile.background }, preferences: p.preferences, current_intent: p.currentIntent, open_to_match: p.openToMatch, language: p.language, is_adult: p.staticProfile.age18Plus }),
    });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not save profile" }, { status: 401 });
  }
}
