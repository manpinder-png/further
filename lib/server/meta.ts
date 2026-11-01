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
    // Muse Spark reasoning makes 20s too tight for teach/course (verified:
    // client saw "took too long" while the model was still generating).
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Meta API ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  return String(data.choices?.[0]?.message?.content ?? "");
}

export interface GroundedCitation {
  url: string;
  title: string;
  start: number;
  end: number;
}

export interface GroundedAnswer {
  text: string;
  citations: GroundedCitation[];
  searched: boolean;
}

/**
 * Web search grounding is a Responses API capability, not a Chat Completions
 * capability.  We deliberately return the citation spans rather than trusting
 * an answer merely because search was enabled: the model is allowed to answer
 * without searching, in which case the card must not be presented as sourced.
 */
export async function groundedAnswer(input: string, opts: { maxTokens?: number } = {}): Promise<GroundedAnswer> {
  const res = await fetch(`${env.metaUrl}/responses`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.metaKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.metaModel,
      input,
      tools: [{ type: "web_search", search_context_size: "medium" }],
      include: ["web_search_call.results"],
      max_output_tokens: opts.maxTokens ?? 500,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Meta Responses API ${res.status}`);
  const data = await res.json() as {
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; annotations?: Array<{ type?: string; url?: string; title?: string; start_index?: number; end_index?: number }> }> }>;
    output_text?: string;
  };
  const citations: GroundedCitation[] = [];
  let text = "";
  let searched = false;
  for (const item of data.output ?? []) {
    if (item.type === "web_search_call") searched = true;
    if (item.type !== "message") continue;
    for (const block of item.content ?? []) {
      if (block.type !== "output_text") continue;
      text += block.text ?? "";
      for (const annotation of block.annotations ?? []) {
        if (annotation.type !== "url_citation" || !annotation.url) continue;
        citations.push({
          url: annotation.url,
          title: annotation.title ?? new URL(annotation.url).hostname,
          start: annotation.start_index ?? 0,
          end: annotation.end_index ?? 0,
        });
      }
    }
  }
  return { text: text || String(data.output_text ?? ""), citations, searched };
}

/** Streams text deltas from Muse Spark (`stream: true`), yielding complete lines. */
export async function* streamLines(messages: Msg[]) {
  const res = await fetch(`${env.metaUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.metaKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.metaModel,
      messages,
      stream: true,
      // Muse Spark spends ~1.1k tokens reasoning before content; a small
      // budget returns finish_reason=length with content=null (verified live).
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok || !res.body) throw new Error(`Meta API ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
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
  // Voice Transcribe has its own ASR endpoint rather than the OpenAI audio
  // compatibility route. The request envelope also leaves room for language
  // and vocabulary biasing as the app grows beyond the AI-tech demo domain.
  form.append("request", new Blob([JSON.stringify({
    model: env.transcribeModel,
    mode: "PUSH_TO_TALK",
    audioEncoding: "WAV",
    languageBias: ["English"],
    keywords: ["CUDA", "GPU", "HBM", "tensor core", "matrix multiplication"],
  })], { type: "application/json" }));
  form.append("audio", audio, "clip.wav");
  const res = await fetch(`${env.metaUrl}/asr/transcribe`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.metaKey}` },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Transcribe ${res.status}`);
  const data = await res.json() as { transcript?: string; text?: string };
  return String(data.transcript ?? data.text ?? "");
}

export const EXPAND_SYSTEM = `You map curiosity into concepts. The user may not know the right words. Infer their intent. Return 5–7 concepts as JSON Lines: first an intent line {"intent","root","rootTitle"}, then one line per concept {"slug","title","hook","edge":{"from","kind"},"difficulty"}. kind is prerequisite|related|part_of. Order them from most approachable to most advanced. Prefer concepts the user's existing map doesn't already cover. Hooks are one sentence and make the user want to tap. No markdown.`;

export const GRADE_SYSTEM = `Grade a learner's spoken explanation of a concept on a 0–3 rubric: 0 off-topic, 1 names the idea, 2 explains the mechanism, 3 explains mechanism and why it matters. Be kind. Return JSON {"score":int,"feedback":"one sentence, under 30 words"}. Never quiz.`;

export const COURSE_SYSTEM = `You are Muse building a 2-minute micro-course for one concept, adapted to how this learner learns. Return JSON {"lessons":[{"title","body","format"}],"adaptedNote"}. Exactly 4 lessons: hook (why care, one vivid sentence + payoff), mechanism (how it actually works, step by step), example (a concrete tiny example with numbers or a picture in words), recall (one question the learner answers in their own words — never a quiz). Bodies under 90 words each, plain language, no markdown. adaptedNote: one sentence naming how you adapted this to the learner (their strengths, pace, style). Build on their strengths; do not repeat what they already understand.`;

export const TEACH_SYSTEM = `You are Muse deciding HOW to teach one concept to THIS learner right now. You study how they learn and choose the single best format — do not default to lecturing. Formats: predict (ask a guessable question, reveal after they choose), manipulate (describe a tiny mental model they can vary: "what happens if X doubles?"), analogy (one vivid comparison, then where it breaks), story (a 3-beat concrete scenario), source-clip (tell them exactly what to look for in the cited source, in under 90 seconds), short-read (a crisp 3-sentence explanation). Return JSON {"format","title","body","interaction":{"prompt","options":[{"label","reveal"}]},"branches":[{"title","why"}],"challenge":{"kind","prompt","options":["3-4 short strings"],"correct":0,"explanation"},"adaptedNote"}. interaction is required for predict/manipulate, optional otherwise. branches: exactly 3 next curiosities this learner can choose, each with why it follows for them. challenge: ALWAYS include one playful activity matched to the format — kind is spot-the-error|order-steps|predict-output|fill-blank, correct is the index of the right option, explanation rewards the reasoning in one sentence. It must be winnable from the body alone. adaptedNote: one sentence on what you observed about this learner and why you chose this format. Body under 110 words. Plain language, no markdown. Never lecture at length; the challenge is a game, not a quiz.`;

export const FACILITATOR_SYSTEM = (a: string, aStrong: string, b: string, bStrong: string, shared: string) =>
  `Two learners. ${a} understands ${aStrong}. ${b} understands ${bStrong}. Both are exploring ${shared}. Run a 10-minute jigsaw. Ask ${a} to explain ${aStrong} in 2 sentences, then ${b} to explain ${bStrong}. Then pose one question that needs both pieces to answer. Keep your turns under 40 words. Never lecture. End with a 3-bullet summary and the concepts each person should add.`;
