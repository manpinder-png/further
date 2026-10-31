// F4: Explain-it-back grading, 0–3 rubric, one sentence of feedback. Never a quiz. Owner: Connor.
import { ExplainRequest, ExplainResult } from "@/lib/schemas";
import { chat, GRADE_SYSTEM, hasMeta } from "@/lib/server/meta";
import { CATALOG } from "@/lib/demo/seed";
import { captureError } from "@/lib/server/observability";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const p = ExplainRequest.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { slug, transcript } = p.data;
  const title = CATALOG[slug]?.title ?? slug;
  try {
    if (hasMeta()) {
      const raw = await chat([{ role: "system", content: GRADE_SYSTEM }, { role: "user", content: `Concept: ${title}\nExplanation: ${transcript}` }], { json: true, maxTokens: 120 });
      const r = ExplainResult.parse(JSON.parse(raw));
      return Response.json({ ...r, demo: false });
    }
    // DEMO heuristic: length + mechanism words. Clearly labeled in the UI.
    const words = transcript.split(/\s+/).length;
    const mech = /(multipl|sum|weight|parallel|at the same time|because|so that)/gi;
    const hits = new Set((transcript.match(mech) ?? []).map((m) => m.toLowerCase())).size;
    const score = Math.min(3, (words > 12 ? 1 : 0) + Math.min(2, hits >= 3 ? 2 : hits >= 1 ? 1 : 0));
    const feedback = score === 3 ? "You nailed the mechanism and why GPUs fit it. Next: what limits it?" : score === 2 ? "Good mechanism. Add why it matters for speed." : "You've named it. Try describing what actually happens step by step.";
    await new Promise((r) => setTimeout(r, 500));
    return Response.json({ score, feedback, demo: true });
  } catch (err) {
    captureError(err, { route: "explain" });
    return Response.json({ error: "Grader unavailable" }, { status: 502 });
  }
}
