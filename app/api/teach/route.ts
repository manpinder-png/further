// Muse decides HOW to teach: it studies the learner model (interests,
// style, pace, format affinities, decayed/fading concepts per MD §5.4) and
// picks ONE format from its repertoire for this user/concept/moment.
// Finishing or skipping the result is new evidence (payload.format), so the
// next decision is better. This is the feed learning the learner.
import { TeachRequest, TeachResult } from "@/lib/schemas";
import { chat, hasMeta, TEACH_SYSTEM } from "@/lib/server/meta";
import { CATALOG } from "@/lib/demo/seed";
import { captureError } from "@/lib/server/observability";

export const dynamic = "force-dynamic";
const FORMATS = ["predict", "manipulate", "analogy", "story", "source-clip", "short-read"] as const;

export async function POST(req: Request) {
  const p = TeachRequest.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { slug, learnerSummary, depth } = p.data;
  const c = CATALOG[slug];
  const title = c?.title ?? slug.replace(/-/g, " ");
  try {
    if (hasMeta()) {
      const raw = await chat(
        [
          { role: "system", content: TEACH_SYSTEM },
          { role: "user", content: `Concept: ${title}. Seed hook: ${c?.hook ?? ""}\nDepth round: ${depth} (1 = first encounter; higher = they stayed to go deeper — skip basics, add mechanism, edge cases, and a harder challenge).\nWhat you know about this learner: ${learnerSummary || "brand new — no evidence yet, vary and observe"}` },
        ],
        { json: true, maxTokens: 4500 },
      );
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      if (s < 0 || e <= s) throw new Error(`Muse returned no teaching JSON (got ${raw.length} chars)`);
      const parsed = JSON.parse(raw.slice(s, e + 1)) as { format?: string };
      const f = String(parsed.format ?? "").toLowerCase();
      parsed.format = (FORMATS as readonly string[]).includes(f) ? f : f.includes("predict") ? "predict" : f.includes("manipul") || f.includes("interactiv") ? "manipulate" : f.includes("analog") ? "analogy" : f.includes("stor") ? "story" : f.includes("clip") || f.includes("video") || f.includes("source") ? "source-clip" : "short-read";
      return Response.json({ slug, ...TeachResult.parse(parsed), demo: false });
    }
    // DEMO decision: same contract, heuristic chooser labeled as demo.
    const format = learnerSummary.includes("visual") ? "manipulate" : learnerSummary.includes("explain-back") ? "predict" : "analogy";
    return Response.json({
      slug,
      format,
      title,
      body: c?.hook ?? `Why ${title} matters, in one idea.`,
      interaction: {
        prompt: format === "manipulate" ? `Picture ${title.toLowerCase()} as a dial. What happens when you turn it all the way up?` : `Quick guess: what is ${title.toLowerCase()} mostly about?`,
        options: [
          { label: "It does more of one simple thing, very fast", reveal: "Close — the trick is doing one simple thing at massive scale, and the limits come from feeding it, not from the core idea." },
          { label: "It is basically magic / general intelligence", reveal: "That is the hype version. Underneath is a narrow mechanism you can picture and even sketch on paper." },
        ],
      },
      branches: [
        { title: `what comes before ${title.toLowerCase()}?`, why: "Fill in the foundation and this node gets easier." },
        { title: `where does ${title.toLowerCase()} break down?`, why: "Limits are where real understanding (and motivation) lives." },
        { title: `show me ${title.toLowerCase()} in the real world`, why: "A concrete use makes the abstract stick." },
      ],
      challenge: {
        kind: "spot-the-error" as const,
        prompt: `One of these about ${title.toLowerCase()} is wrong. Spot it.`,
        options: ["It builds on simpler ideas you can learn first", "You either get it instantly or never will", "Skipping the basics is why it feels hard"],
        correct: 1,
        explanation: "Exactly — nobody 'just gets it'. It only looks instant after the smaller pieces click, which is what your path is building.",
      },
      adaptedNote: learnerSummary ? `Demo chooser shaped by your profile: ${learnerSummary.slice(0, 160)}` : "Demo chooser. Add your Meta key and Muse decides the format live.",
      demo: true,
    });
  } catch (err) {
    captureError(err, { route: "teach", slug });
    return Response.json({ error: err instanceof Error ? err.message : "Teaching unavailable" }, { status: 502 });
  }
}
