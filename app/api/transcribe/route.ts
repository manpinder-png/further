// F1: Muse Voice Transcribe. Browser MediaRecorder → here → text. Owner: Connor / Sirpreet.
import { hasMeta, transcribe } from "@/lib/server/meta";
import { captureError } from "@/lib/server/observability";
import { DEMO_EXPLAIN_TRANSCRIPT } from "@/lib/demo/seed";

export const dynamic = "force-dynamic";
const MAX_BYTES = 5 * 1024 * 1024; // ~60s of opus audio

export async function POST(req: Request) {
  const t0 = Date.now();
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  const purpose = String(form?.get("purpose") ?? "curiosity");
  if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ error: "No audio received. Try again or type instead." }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ error: "Clip too long. Keep it under a minute." }, { status: 413 });
  try {
    if (hasMeta()) return Response.json({ text: await transcribe(audio), ms: Date.now() - t0, demo: false });
    await new Promise((r) => setTimeout(r, 600));
    const text = purpose === "explain" ? DEMO_EXPLAIN_TRANSCRIPT : "Why does training AI need special chips?";
    return Response.json({ text, ms: Date.now() - t0, demo: true });
  } catch (err) {
    captureError(err, { route: "transcribe" });
    return Response.json({ error: "Couldn't hear that. Try again or type instead." }, { status: 502 });
  }
}
