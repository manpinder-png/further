// F2: Streaming concept expansion with canonicalization (plan §5.2). Owner: Connor.
// Output: Server-Sent Events, one ExpansionLine per event, so the map grows node by node.
import { ExpandRequest, ModelIntentLine, ModelNodeLine } from "@/lib/schemas";
import { canonicalize, cosine, demoEmbed, toSlug } from "@/lib/canonicalize";
import { CATALOG, DEMO_EXPANSION, NEAR } from "@/lib/demo/seed";
import { EXPAND_SYSTEM, hasMeta, streamLines } from "@/lib/server/meta";
import { checkRate } from "@/lib/server/ratelimit";
import { captureError } from "@/lib/server/observability";
import type { ExpansionLine } from "@/lib/types";

export const dynamic = "force-dynamic";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const parsed = ExpandRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Say a bit more about what you're curious about." }, { status: 400 });
  const rate = checkRate("demo-user"); // TODO(Connor): real user id from Supabase Auth
  if (!rate.ok) return Response.json({ error: "Rate limit: 30 expansions per hour." }, { status: 429 });

  const { text, mapSummary } = parsed.data;
  const existing = mapSummary.map((s) => ({ slug: s, title: CATALOG[s]?.title ?? s.replace(/-/g, " ") }));
  const t0 = Date.now();
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (l: ExpansionLine) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(l)}\n\n`));
      let count = 0;
      const emitNode = (n: Omit<Extract<ExpansionLine, { type: "node" }>, "type" | "canonical">) => {
        const hit = canonicalize(n.title, existing);
        send({ type: "node", ...n, canonical: hit && hit.slug !== n.slug ? { reusedSlug: hit.slug, similarity: hit.similarity } : null });
        if (!hit) existing.push({ slug: n.slug, title: n.title });
        count++;
      };
      try {
        if (hasMeta()) {
          let gotIntent = false;
          for await (const line of streamLines([
            { role: "system", content: EXPAND_SYSTEM },
            { role: "user", content: `Curiosity: ${text}\nExisting map: ${mapSummary.join(", ") || "(empty)"}` },
          ])) {
            let obj: unknown;
            try { obj = JSON.parse(line); } catch { continue; } // invalid lines are dropped
            if (!gotIntent) {
              const i = ModelIntentLine.safeParse(obj);
              if (i.success) { gotIntent = true; send({ type: "intent", ...i.data }); continue; }
            }
            const n = ModelNodeLine.safeParse(obj);
            if (n.success) emitNode(n.data);
          }
        } else {
          await demoExpand(text, mapSummary, send, emitNode);
        }
        send({ type: "done", count, ms: Date.now() - t0 });
      } catch (err) {
        captureError(err, { route: "expand" });
        send({ type: "error", message: "The map agent hit an error. Try again." });
      }
      ctrl.close();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-further-mode": hasMeta() ? "live" : "demo", "x-ratelimit-remaining": String(rate.remaining) },
  });
}

/** DEMO: canned expansion for the demo script, otherwise nearest catalog concepts. */
async function demoExpand(
  text: string,
  onMap: string[],
  send: (l: ExpansionLine) => void,
  emitNode: (n: { slug: string; title: string; hook: string; edge: { from: string; kind: "prerequisite" | "related" | "part_of" }; difficulty: number }) => void,
) {
  await sleep(450);
  if (DEMO_EXPANSION.match.test(text)) {
    const root = DEMO_EXPANSION.root;
    send({ type: "intent", intent: DEMO_EXPANSION.intent, root, rootTitle: DEMO_EXPANSION.rootTitle });
    if (!onMap.includes(root)) {
      await sleep(300);
      emitNode({ slug: root, title: CATALOG[root].title, hook: CATALOG[root].hook, edge: DEMO_EXPANSION.rootEdge, difficulty: 1 });
    }
    for (const n of DEMO_EXPANSION.nodes) {
      await sleep(380);
      const c = CATALOG[n.slug];
      emitNode({ slug: c.slug, title: c.title, hook: c.hook, edge: { from: root, kind: n.kind }, difficulty: n.difficulty });
    }
    await sleep(380);
    emitNode({ slug: "floating-point-formats", title: DEMO_EXPANSION.duplicate.title, hook: DEMO_EXPANSION.duplicate.hook, edge: { from: root, kind: "related" }, difficulty: 3 });
    return;
  }
  // "what is HBM memory" → a known concept arrives alone, attached to its neighbour (demo step 5).
  const known = canonicalize(text, Object.values(CATALOG));
  if (known) {
    const c = CATALOG[known.slug];
    const near = NEAR[c.slug];
    const from = near && onMap.includes(near.from) ? near.from : onMap[onMap.length - 1] ?? c.slug;
    send({ type: "intent", intent: `Understand ${c.title}`, root: c.slug, rootTitle: c.title });
    await sleep(350);
    emitNode({ slug: c.slug, title: c.title, hook: c.hook, edge: { from, kind: near?.kind ?? "related" }, difficulty: 2 });
    return;
  }
  const q = demoEmbed(text);
  const ranked = Object.values(CATALOG)
    .filter((c) => !onMap.includes(c.slug))
    .map((c) => ({ c, s: cosine(q, demoEmbed(`${c.title} ${c.hook}`)) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);
  const rootTitle = text.replace(/[?.!]+$/, "").slice(0, 48);
  const root = toSlug(rootTitle);
  send({ type: "intent", intent: `Explore: ${rootTitle}`, root, rootTitle });
  await sleep(300);
  emitNode({ slug: root, title: rootTitle.charAt(0).toUpperCase() + rootTitle.slice(1), hook: "Your question, as a place on the map.", edge: { from: onMap[0] ?? root, kind: "related" }, difficulty: 1 });
  for (const [i, { c }] of ranked.entries()) {
    await sleep(380);
    emitNode({ slug: c.slug, title: c.title, hook: c.hook, edge: { from: root, kind: i === 0 ? "prerequisite" : "related" }, difficulty: Math.min(5, i + 1) });
  }
}
