import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMetaWav } from "../domains/agents/audio.ts";
import { transcribeMetaAudio } from "../domains/agents/openai-provider.ts";
import { AgentError } from "../domains/agents/contracts.ts";

function recording(rate = 24_000, seconds = 0.1) {
  const bytes = Math.ceil(rate * seconds) * 2;
  const buffer = new ArrayBuffer(44 + bytes), view = new DataView(buffer);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + bytes, true); text(8, "WAVE"); text(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, bytes, true);
  return new Blob([buffer], { type: "audio/wav" });
}

test("WAV validation checks actual encoding, declared lengths and duration", async () => {
  assert.deepEqual(await validateMetaWav(recording()), { sampleRate: 24000, durationSeconds: 0.1 });
  assert.equal((await validateMetaWav(recording(16000))).sampleRate, 16000);
  for (const input of [recording(48000), recording().slice(0, 40), recording(16000, 61)]) {
    await assert.rejects(validateMetaWav(input, 60), (error: unknown) => error instanceof AgentError && error.code === "INVALID_INPUT");
  }
});

test("ASR uses Meta multipart WAV protocol and returns only the transcript", async () => {
  let target = ""; let settings: unknown; let file: unknown;
  const transport: typeof fetch = async (url, options) => {
    target = String(url);
    const form = options?.body as FormData;
    settings = JSON.parse(await (form.get("request") as Blob).text());
    file = form.get("audio");
    return Response.json({ transcript: "How does parallel work help?", sessionId: "provider-id" });
  };
  const result = await transcribeMetaAudio(recording(), { apiKey: "not-real", fetch: transport });
  assert.equal(target, "https://api.meta.ai/v1/asr/transcribe");
  assert.deepEqual(settings, { model: "muse-voice-transcribe-1.0", mode: "PUSH_TO_TALK", audioEncoding: "WAV" });
  assert.ok(file instanceof Blob);
  assert.equal(result.transcript, "How does parallel work help?");
  assert.equal(result.provider, "meta");
});

test("ASR failures redact provider bodies and preserve cancellation", async () => {
  await assert.rejects(transcribeMetaAudio(recording(), { apiKey: "not-real", fetch: async () => Response.json({ error: "secret recording detail" }, { status: 429 }) }), (error: unknown) => error instanceof AgentError && error.retryable && !error.message.includes("secret"));
  const abort = new AbortController(); abort.abort();
  await assert.rejects(transcribeMetaAudio(recording(), { apiKey: "not-real", signal: abort.signal, fetch: async (_url, options) => { options?.signal?.throwIfAborted(); throw new Error("never"); } }), (error: unknown) => error instanceof AgentError && error.code === "CANCELLED");
});

test("ASR streaming sends the documented cumulative protocol and emits real replacement drafts", async () => {
  let settings: Record<string, unknown> = {}, accept = "";
  const events: import("../domains/agents/contracts.ts").AgentEvent[] = [];
  const transport: typeof fetch = async (_url, options) => {
    settings = JSON.parse(await ((options?.body as FormData).get("request") as Blob).text());
    accept = new Headers(options?.headers).get("accept") ?? "";
    const wire = [
      { type: "transcript", transcript: "How", final: false },
      { type: "transcript", transcript: "How do GPUs work?", final: true },
    ].map(e => `data: ${JSON.stringify(e)}\n\n`).join("");
    return new Response(wire, { headers: { "content-type": "text/event-stream" } });
  };
  const result = await transcribeMetaAudio(recording(), { apiKey: "not-real", fetch: transport, onEvent: e => events.push(e) });
  assert.equal(accept, "text/event-stream"); assert.equal(settings.partialMode, "CUMULATIVE"); assert.equal(settings.emitAudioProgress, true);
  assert.equal(result.transcript, "How do GPUs work?");
  assert.equal(events.filter(e => e.type === "text_delta" && e.replace).length, 2);
});
