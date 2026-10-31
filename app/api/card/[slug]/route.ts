// F3: Node card. Production: web-search grounding finds 3 candidates → oEmbed/HTTP
// check → best stored in `resources` and cached per concept (second user costs $0).
// Hook is written FROM the source and cites it. Owner: Connor + Manpinder.
import { slug as Slug } from "@/lib/schemas";
import { CATALOG, DIAGRAMS, RESOURCES } from "@/lib/demo/seed";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!Slug.safeParse(slug).success) return Response.json({ error: "Bad slug" }, { status: 400 });
  const c = CATALOG[slug];
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
