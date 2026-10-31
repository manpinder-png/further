import "server-only";
import { env } from "./config";

// Meta Model API client (OpenAI-compatible). Owner: Connor.
// Plan §3: "the OpenAI SDK pointed at Meta's base URL". We use fetch to keep the
// bundle small; swapping to `new OpenAI({ baseURL: env.metaUrl })` is a drop-in.
//
// Privacy rule (plan §3 model note): real user data → env.metaModel only.
// Contributor models are for dev/evals and are never passed user content.

export const hasMeta = () => !!env.metaKey;

type Msg = { role: "system" | "user" | "assistant"; content: string };

export async function chat(messages: Msg[], opts: { json?: boolean; maxTokens?: number } = {}) {
  const res = await fetch(`${env.metaUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.metaKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.metaModel,
      messages,
      max_tokens: opts.maxTokens ?? 800,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Meta API ${res.status}`);
  const data = await res.json();
  return String(data.choices?.[0]?.message?.content ?? "");
}

/** Streams text deltas from Muse Spark (`stream: true`), yielding complete lines. */
export async function* streamLines(messages: Msg[], opts: { webSearch?: boolean } = {}) {
  const res = await fetch(`${env.metaUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.metaKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.metaModel,
      messages,
      stream: true,
      max_tokens: 1200,
      // TODO(Connor): confirm the web-search grounding parameter name in Meta docs.
      ...(opts.webSearch ? { tools: [{ type: "web_search" }] } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok || !res.body) throw new Error(`Meta API ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let sse = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    sse += dec.decode(value, { stream: true });
    let i;
    while ((i = sse.indexOf("\n")) >= 0) {
      const raw = sse.slice(0, i).trim();
      sse = sse.slice(i + 1);
      if (!raw.startsWith("data:")) continue;
      const payload = raw.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        text += JSON.parse(payload).choices?.[0]?.delta?.content ?? "";
      } catch {
        /* ignore keepalives */
      }
      let j;
      while ((j = text.indexOf("\n")) >= 0) {
        const line = text.slice(0, j).trim();
        text = text.slice(j + 1);
        if (line) yield line;
      }
    }
  }
  if (text.trim()) yield text.trim();
}

/** Muse Voice Transcribe. Audio comes from the browser's MediaRecorder. */
export async function transcribe(audio: Blob) {
  const form = new FormData();
  form.append("file", audio, "clip.webm");
  form.append("model", env.transcribeModel);
  const res = await fetch(`${env.metaUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.metaKey}` },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Transcribe ${res.status}`);
  return String((await res.json()).text ?? "");
}

export const EXPAND_SYSTEM = `You map curiosity into concepts. The user may not know the right words. Infer their intent. Return 5–7 concepts as JSON Lines: first an intent line {"intent","root","rootTitle"}, then one line per concept {"slug","title","hook","edge":{"from","kind"},"difficulty"}. kind is prerequisite|related|part_of. Order them from most approachable to most advanced. Prefer concepts the user's existing map doesn't already cover. Hooks are one sentence and make the user want to tap. No markdown.`;

export const GRADE_SYSTEM = `Grade a learner's spoken explanation of a concept on a 0–3 rubric: 0 off-topic, 1 names the idea, 2 explains the mechanism, 3 explains mechanism and why it matters. Be kind. Return JSON {"score":int,"feedback":"one sentence, under 30 words"}. Never quiz.`;

export const FACILITATOR_SYSTEM = (a: string, aStrong: string, b: string, bStrong: string, shared: string) =>
  `Two learners. ${a} understands ${aStrong}. ${b} understands ${bStrong}. Both are exploring ${shared}. Run a 10-minute jigsaw. Ask ${a} to explain ${aStrong} in 2 sentences, then ${b} to explain ${bStrong}. Then pose one question that needs both pieces to answer. Keep your turns under 40 words. Never lecture. End with a 3-bullet summary and the concepts each person should add.`;
