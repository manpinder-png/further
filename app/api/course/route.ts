// The product: Muse builds the course. A concept is not a video link — it is
// 4 short lessons Muse writes for THIS learner, adapted to their strengths,
// pace and style (lib/learn.ts). The cited source is support ("go deeper"),
// never the lesson itself. Live: Muse Spark. Demo: labeled template.
import { CourseRequest, CourseResult } from "@/lib/schemas";
import { chat, COURSE_SYSTEM, hasMeta } from "@/lib/server/meta";
import { CATALOG, DIAGRAMS } from "@/lib/demo/seed";
import { captureError } from "@/lib/server/observability";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const p = CourseRequest.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { slug, learnerSummary } = p.data;
  const c = CATALOG[slug];
  const title = c?.title ?? slug.replace(/-/g, " ");
  try {
    if (hasMeta()) {
      const raw = await chat(
        [
          { role: "system", content: COURSE_SYSTEM },
          { role: "user", content: `Concept: ${title}. Seed hook: ${c?.hook ?? ""}\nLearner: ${learnerSummary || "new learner, no history yet"}` },
        ],
        { json: true, maxTokens: 6000 },
      );
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start < 0 || end <= start) throw new Error(`Muse returned no course JSON (got ${raw.length} chars)`);
      const parsed = JSON.parse(raw.slice(start, end + 1)) as { lessons?: { format?: string }[] };
      const formats = ["hook", "mechanism", "example", "recall"];
      parsed.lessons?.forEach((l, i) => {
        const f = String(l.format ?? "").toLowerCase();
        l.format = f.includes("hook") || f.includes("intro") ? "hook" : f.includes("mechan") || f.includes("explain") ? "mechanism" : f.includes("example") ? "example" : f.includes("recall") || f.includes("question") ? "recall" : formats[i] ?? "hook";
      });
      const course = CourseResult.parse(parsed);
      return Response.json({ slug, title, ...course, demo: false });
    }
    // DEMO template — same shape Muse returns, clearly labeled. It is built
    // from the seed hook/diagram, not generated, and the UI says so.
    const lessons = [
      { title: "The hook", body: c?.hook ?? `Why ${title} matters, in one idea.`, format: "hook" as const },
      {
        title: "How it works",
        body: DIAGRAMS[slug]
          ? "Follow the flowchart below left to right: each arrow is one thing happening. That chain is the whole mechanism — nothing else is hiding underneath."
          : `Start from what you already get, then add one step at a time. ${c?.hook ?? ""} Each step only makes sense because of the one before it.`,
        format: "mechanism" as const,
      },
      {
        title: "A tiny example",
        body: "Shrink it until it fits on a napkin: pick the smallest numbers or the simplest case you can, and walk the mechanism once by hand. If the small case makes sense, the big one is just more of the same.",
        format: "example" as const,
      },
      { title: "Say it back", body: `In your own words: what is ${title.toLowerCase()}, and why does it matter? Use Explain it back below — your map lights up when it lands.`, format: "recall" as const },
    ];
    return Response.json({
      slug,
      title,
      lessons,
      adaptedNote: learnerSummary ? `Demo template shaped by your profile: ${learnerSummary.slice(0, 140)}` : "Demo template. Add a Meta key and Muse writes this for you personally.",
      demo: true,
    });
  } catch (err) {
    captureError(err, { route: "course", slug });
    return Response.json({ error: err instanceof Error ? err.message : "Course unavailable" }, { status: 502 });
  }
}
