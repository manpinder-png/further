// F3: Node card. Production: web-search grounding finds 3 candidates → oEmbed/HTTP
// check → best stored in `resources` and cached per concept (second user costs $0).
// Hook is written FROM the source and cites it. Owner: Connor + Manpinder.
import { slug as Slug } from "@/lib/schemas";
import { CATALOG, DIAGRAMS, RESOURCES } from "@/lib/demo/seed";
import { groundedAnswer, hasMeta } from "@/lib/server/meta";
import { captureError } from "@/lib/server/observability";
import { adminRest, hasSupabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!Slug.safeParse(slug).success) return Response.json({ error: "Bad slug" }, { status: 400 });
  const c = CATALOG[slug];
  const cached = hasSupabase() ? await readCached(slug).catch(() => null) : null;
  if (cached) return Response.json(cached);
  if (hasMeta()) {
    try {
      const title = c?.title ?? slug.replace(/-/g, " ");
      const answer = await groundedAnswer(
        `Explain ${title} for a curious technical beginner in exactly three short sentences. ` +
          `Make each factual claim traceable to a web citation. Do not use markdown, do not invent a source, and finish with one practical reason it matters.`,
        { maxTokens: 280 },
      );
      // Meta may legitimately elect not to search. That is not a sourced card;
      // fail closed to the explicit, labelled demo fallback instead of implying a citation.
      if (answer.searched && answer.citations.length) {
        const source = answer.citations[0];
        const hook = answer.text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3);
        if (hook.length) {
          const card = {
            slug,
            title,
            hook,
            resource: {
              slug,
              url: source.url,
              kind: "article",
              title: source.title,
              provider: new URL(source.url).hostname.replace(/^www\./, ""),
              verifiedAt: Date.now(),
              demo: false,
            },
            diagram: null,
            cached: false,
            demo: false,
            citations: answer.citations,
          };
          if (hasSupabase()) await cacheCard(slug, hook, source, answer.citations).catch((err) => captureError(err, { route: "card-cache", slug }));
          return Response.json(card);
        }
      }
    } catch (err) {
      captureError(err, { route: "card", slug });
    }
  }
  const resource = RESOURCES[slug] ?? null;
  return Response.json({
    slug,
    title: c?.title ?? slug.replace(/-/g, " "),
    hook: c ? [c.hook, resource ? `${resource.provider} walks through it${resource.kind === "video" ? " visually" : ""}.` : "", "Tap the source, then try explaining it back."].filter(Boolean) : ["No grounded source yet. The grounding agent will fill this in."],
    resource,
    diagram: DIAGRAMS[slug] ?? null,
    cached: !!resource,
    demo: true,
  });
}

type Citation = { url: string; title: string; start: number; end: number };
type Cached = { slug: string; title: string; hook: string[]; resource: { slug: string; url: string; kind: "article"; title: string; provider: string; verifiedAt: number; demo: false }; diagram: null; cached: true; demo: false; citations: Citation[] };

async function readCached(slug: string): Promise<Cached | null> {
  const concepts = await (await adminRest(`concepts?slug=eq.${encodeURIComponent(slug)}&select=id,title&limit=1`)).json() as Array<{ id: string; title: string }>;
  if (!concepts[0]) return null;
  const cards = await (await adminRest(`concept_cards?concept_id=eq.${concepts[0].id}&select=hook,citations,resource_id,generated_at&limit=1`)).json() as Array<{ hook: string[]; citations: Citation[]; resource_id: string | null; generated_at: string }>;
  const card = cards[0];
  if (!card?.resource_id) return null;
  const resources = await (await adminRest(`resources?id=eq.${card.resource_id}&select=url,title,provider&limit=1`)).json() as Array<{ url: string; title: string; provider: string }>;
  const resource = resources[0];
  if (!resource) return null;
  return { slug, title: concepts[0].title, hook: card.hook, resource: { slug, url: resource.url, kind: "article", title: resource.title, provider: resource.provider, verifiedAt: Date.parse(card.generated_at), demo: false }, diagram: null, cached: true, demo: false, citations: card.citations };
}

async function cacheCard(slug: string, hook: string[], source: { url: string; title: string }, citations: Citation[]) {
  const concepts = await (await adminRest(`concepts?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`)).json() as Array<{ id: string }>;
  if (!concepts[0]) return;
  const inserted = await adminRest("resources", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ concept_id: concepts[0].id, url: source.url, kind: "article", title: source.title, provider: new URL(source.url).hostname.replace(/^www\./, ""), verified_at: new Date().toISOString() }),
  });
  const resource = (await inserted.json() as Array<{ id: string }>)[0];
  if (!resource) return;
  await adminRest("concept_cards?on_conflict=concept_id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ concept_id: concepts[0].id, hook, citations, resource_id: resource.id, model: "muse-spark-1.3" }),
  });
}
