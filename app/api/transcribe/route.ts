import { z } from "zod";
import { validateMetaWav } from "@/domains/agents/audio";
import { transcribeMetaAudio } from "@/domains/agents/openai-provider";
import { handle, HttpError } from "@/domains/backend/http";
import { withProgress } from "@/domains/backend/streaming";
import { requireActor } from "@/domains/backend/identity";

export const dynamic = "force-dynamic";
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024;

/** Count streamed bytes before parsing multipart; a missing length cannot bypass the cap. */
async function boundedForm(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new HttpError(413, "Keep the recording under a minute.");
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data;")) throw new HttpError(400, "Send the recording as a multipart upload.");
  if (!req.body) throw new HttpError(400, "No audio received. Try again or type instead.");
  const reader = req.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      if (req.signal.aborted) throw new HttpError(499, "Transcription was cancelled.");
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new HttpError(413, "Keep the recording under a minute."); }
      chunks.push(new Uint8Array(value));
    }
  } finally { reader.releaseLock(); }
  try { return await new Response(new Blob(chunks), { headers: { "content-type": contentType } }).formData(); }
  catch { throw new HttpError(400, "The audio upload could not be read."); }
}

export async function POST(req: Request) {
  return handle(req, async () => {
    await requireActor(req);
    const started = Date.now();
    const form = await boundedForm(req);
    const audio = form.get("audio");
    const purpose = z.enum(["curiosity", "explain"]).parse(form.get("purpose") ?? "curiosity");
    if (!(audio instanceof Blob) || !audio.size) throw new HttpError(400, "No audio received. Try again or type instead.");
    if (audio.size > MAX_AUDIO_BYTES) throw new HttpError(413, "Keep the recording under a minute.");
    await validateMetaWav(audio, 60);
    return withProgress(req,"perception",async progress=>{
    progress.activity("tool_completed","Audio upload received and recording format checked.");
    if (req.headers.get("x-further-demo") === "true" || process.env.FURTHER_MODEL_MODE === "fixture") {
      progress.activity("completed","Prepared sample text for this preview.");
      return {
        text: purpose === "explain" ? "This is a sample explanation for rehearsing the interface, not a transcription of the recording." : "How do graphics processors handle work in parallel?",
        ms: Date.now() - started, demo: true, mode: "fixture", provider: "fixture", model: "explicit-offline-fixture",
      };
    }
    progress.activity("waiting","Transcribing the recording.");
    const result = await transcribeMetaAudio(audio, { signal: progress.signal,onEvent:progress.onEvent });
    progress.activity("completed","Transcription received.");
    return { text: result.transcript, ms: Date.now() - started, demo: false, provider: result.provider, model: result.model, mode: result.mode };
    });
  });
}
