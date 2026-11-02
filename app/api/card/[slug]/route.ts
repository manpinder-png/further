import { randomUUID } from "node:crypto";
import { slug as Slug } from "@/lib/schemas";
import { invokeAgent } from "@/domains/backend/agents";
import { handle, idempotencyKey } from "@/domains/backend/http";
import { withProgress } from "@/domains/backend/streaming";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  return handle(req, async () => {
    const actorId = await requireActor(req);
    const slug = Slug.parse((await ctx.params).slug);
    const concept = (await (await getRepository()).getSnapshot(actorId)).concepts.find(c => c.slug === slug);
    const title = concept?.title ?? slug.replace(/-/g, " ");
    const key=`card:${idempotencyKey(req,randomUUID())}`;
    return withProgress(req,"resource-guide",async progress=>{
    const result = await invokeAgent(actorId, "resource-guide", {
      query: `Explain ${title} to a curious technical beginner in three short sentences, grounding factual claims in web citations. Finish with a practical reason it matters. Prefer an authoritative source.`, kind: "any",
    }, { idempotencyKey:key, signal:progress.signal,onEvent:progress.onEvent, fixture: req.headers.get("x-further-demo") === "true" });
    const source = result.data.grounded ? result.data.sources[0] : undefined;
    return {
      slug, title, hook: [result.data.answer],
      resource: source ? {
        slug, url: source.url, kind: "article", title: source.title,
        provider: new URL(source.url).hostname.replace(/^www\./, ""),
        // Search citation provenance is not a successful reachability/oEmbed check.
        demo: false,
      } : null,
      diagram: null, cached: false, demo: result.mode === "fixture",
      citations: result.data.sources, grounded: result.data.grounded, runId: result.runId,
    };
    });
  });
}
