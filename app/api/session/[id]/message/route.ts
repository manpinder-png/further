// F8 + N4: Every peer message → Llama Guard → (if safe) Supabase Broadcast.
// Then the facilitator (Muse Spark, jigsaw prompt) may take a turn. Owner: Amit + Connor.
import { z } from "zod";
import { moderate } from "@/lib/server/moderation";
import { chat, FACILITATOR_SYSTEM, hasMeta } from "@/lib/server/meta";
import { captureError } from "@/lib/server/observability";

export const dynamic = "force-dynamic";

const Body = z.object({
  from: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(1000),
  turn: z.number().int().min(0).max(50),
  ctx: z.object({ a: z.string(), aStrong: z.string(), b: z.string(), bStrong: z.string(), shared: z.string() }),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1000) })).max(40).default([]),
});

// DEMO facilitator script (labeled DEMO in the UI). Turns stay under 40 words.
const SCRIPT = [
  (c: Z) => `Nice. ${c.b}, your turn: explain ${c.bStrong} in two sentences. ${c.a}, listen for anything that connects to what you just said.`,
  (c: Z) => `Here's one that needs both pieces: if a GPU can do thousands of ${c.aStrong.toLowerCase()} steps at once, why might it still sit idle half the time? Answer together.`,
  (c: Z) => `Exactly. Compute is cheap; feeding it is the bottleneck. One more: what would you change in the hardware to fix it?`,
  (c: Z) => `Wrapping up. Summary:\n• ${c.aStrong} is the work: billions of multiply-adds.\n• ${c.bStrong} is the pipe that feeds it.\n• Faster chips need wider pipes (→ HBM).\nAdd: HBM memory, ${c.bStrong} → ${c.a}; ${c.aStrong} → ${c.b}.`,
];
type Z = z.infer<typeof Body>["ctx"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success || id.length > 64) return Response.json({ error: "Invalid message" }, { status: 400 });
  const { text, turn, ctx: c, history } = p.data;
  try {
    const verdict = await moderate(text);
    if (!verdict.safe) return Response.json({ delivered: false, verdict });
    // TODO(Amit): supabase.channel(`session:${id}`).send({ type: "broadcast", event: "msg", payload })
    let facilitator: string | null = null;
    let demo = true;
    if (hasMeta()) {
      facilitator = await chat([{ role: "system", content: FACILITATOR_SYSTEM(c.a, c.aStrong, c.b, c.bStrong, c.shared) }, ...history, { role: "user", content: text }], { maxTokens: 160 });
      demo = false;
    } else {
      await new Promise((r) => setTimeout(r, 700));
      facilitator = SCRIPT[Math.min(turn, SCRIPT.length - 1)](c);
    }
    return Response.json({ delivered: true, verdict, facilitator, done: turn >= SCRIPT.length - 1, demo });
  } catch (err) {
    captureError(err, { route: "session/message", id });
    return Response.json({ error: "Moderation unavailable, message held." }, { status: 503 });
  }
}
