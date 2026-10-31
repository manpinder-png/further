import "server-only";
import { env } from "./config";

// Llama Guard on Fireworks/Baseten partner credits (plan §5.6). Owner: Amit.
// Every peer message passes through here BEFORE it is broadcast.

export interface Verdict {
  safe: boolean;
  category?: string; // e.g. S1..S14 from the Llama Guard taxonomy
  engine: "llama-guard" | "demo-heuristic";
  ms: number;
}

const DEMO_BLOCK = /\b(kill yourself|kys|send nudes|your address|phone number|credit card)\b/i;

export async function moderate(text: string): Promise<Verdict> {
  const t0 = Date.now();
  if (env.guardUrl && env.guardKey) {
    const res = await fetch(`${env.guardUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.guardKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: env.guardModel, messages: [{ role: "user", content: text }], max_tokens: 20 }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`Llama Guard ${res.status}`);
    const out = String((await res.json()).choices?.[0]?.message?.content ?? "").trim();
    const unsafe = out.toLowerCase().startsWith("unsafe");
    return { safe: !unsafe, category: unsafe ? out.split("\n")[1] : undefined, engine: "llama-guard", ms: Date.now() - t0 };
  }
  const hit = DEMO_BLOCK.test(text);
  return { safe: !hit, category: hit ? "S? (demo)" : undefined, engine: "demo-heuristic", ms: Date.now() - t0 };
}
