import "server-only";
import { validateMetaWav } from "./audio.ts";
import { readMetaResponseStream, readBasetenChatStream } from "./provider-streams.ts";
import { readTranscriptionStream } from "./transcription-stream.ts";
import OpenAI from "openai";
import type { ResponseInputItem, ResponseCreateParamsNonStreaming, ResponseOutputItem } from "openai/resources/responses/responses";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions/completions";
import { AgentError, type AgentId, type AgentModel, type ModelRequest, type ModelTurn, type ModelMessage, type AgentEvent } from "./contracts.ts";

export const META_BASE_URL = "https://api.meta.ai/v1";
export const BASETEN_BASE_URL = "https://inference.baseten.co/v1";
export const BASETEN_HACKATHON_MODEL = "meta-models/muse-spark-open-1026";
export const DIRECT_TEXT_MODELS = ["muse-spark-1.3", "muse-spark-1.2", "muse-spark-1.1", "muse-wonder-1.0"] as const;
export interface ModelRoute { provider: "meta" | "baseten"; model: string; effort: "low" | "medium" | "high" }
export type ModelRouting = Record<AgentId, ModelRoute>;
export interface ProviderConfiguration {
  metaApiKey?: string;
  basetenApiKey?: string;
  routes: ModelRouting;
  /** Test transport injection; no alternative provider base URLs are accepted. */
  fetch?: typeof fetch;
}
interface ReplayState { items: ResponseInputItem[]; consumedMessages: number; provider: "meta"; model: string }

/** Explicit routes. A missing key fails; an API failure never changes provider or returns a fixture. */
export function routingFromEnvironment(env: NodeJS.ProcessEnv = process.env): ModelRouting {
  const core = env.META_MODEL ?? "muse-spark-1.3";
  const map = env.FURTHER_MAP_MODEL ?? core;
  const metadataProvider = env.FURTHER_METADATA_PROVIDER ?? "meta";
  if (metadataProvider !== "meta" && metadataProvider !== "baseten") throw new AgentError("CONFIGURATION", "FURTHER_METADATA_PROVIDER must be meta or baseten.");
  return {
    metadata: { provider: metadataProvider, model: metadataProvider === "baseten" ? BASETEN_HACKATHON_MODEL : core, effort: "low" },
    "knowledge-map": { provider: "meta", model: map, effort: "medium" },
    "peer-guide": { provider: "meta", model: core, effort: "low" },
    "learning-companion": { provider: "meta", model: core, effort: "low" },
    "resource-guide": { provider: "meta", model: core, effort: "low" },
    perception: { provider: "meta", model: core, effort: "low" },
  };
}

function assertRoute(route: ModelRoute) {
  if (route.provider === "meta" && !(DIRECT_TEXT_MODELS as readonly string[]).includes(route.model)) throw new AgentError("CONFIGURATION", "Only approved standard Meta text models may receive learner content.");
  if (route.provider === "baseten" && route.model !== BASETEN_HACKATHON_MODEL) throw new AgentError("CONFIGURATION", "The Baseten grant requires its exact hackathon model.");
}
function messageItems(message: ModelMessage): ResponseInputItem[] {
  if (message.role === "tool") return [{ type: "function_call_output", call_id: message.toolCallId!, output: message.content }];
  if (message.role === "assistant" && message.toolCalls?.length) {
    return message.toolCalls.map((c) => ({ type: "function_call", call_id: c.id, name: c.name, arguments: c.arguments }));
  }
  return [{ role: message.role, content: message.content }];
}

/** Core OpenAI SDK with provider-specific adapters; no OpenAI inference or trace exporter is used. */
export class OpenAICompatibleAgentModel implements AgentModel {
  private readonly clients = new Map<"meta" | "baseten", OpenAI>();
  constructor(private readonly configuration: ProviderConfiguration) {
    for (const route of Object.values(configuration.routes)) assertRoute(route);
  }
  private client(provider: "meta" | "baseten") {
    const previous = this.clients.get(provider);
    if (previous) return previous;
    const apiKey = provider === "meta" ? this.configuration.metaApiKey : this.configuration.basetenApiKey;
    if (!apiKey) throw new AgentError("CONFIGURATION", `${provider === "meta" ? "Meta" : "Baseten"} is not configured for this agent.`);
    const client = new OpenAI({
      apiKey, baseURL: provider === "meta" ? META_BASE_URL : BASETEN_BASE_URL,
      organization: null, project: null, logLevel: "off",
      maxRetries: 0, timeout: 150_000, ...(this.configuration.fetch ? { fetch: this.configuration.fetch } : {}),
    });
    this.clients.set(provider, client);
    return client;
  }
  async complete(request: ModelRequest): Promise<ModelTurn> {
    const route = this.configuration.routes[request.agentId];
    assertRoute(route);
    try {
      return route.provider === "meta" ? await this.metaResponse(request, route) : await this.basetenChat(request, route);
    } catch (error) {
      if (error instanceof AgentError) throw error;
      if (request.signal.aborted) throw new AgentError("CANCELLED", "The model request was cancelled.");
      const status = error instanceof OpenAI.APIError ? error.status : undefined;
      // Raw provider bodies may contain prompts, identifiers or secrets. Do not expose them to UI/logs.
      throw new AgentError("PROVIDER", `${route.provider === "meta" ? "Meta" : "Baseten"} could not complete the request${status ? ` (HTTP ${status})` : ""}.`, status === 429 || (status !== undefined && status >= 500));
    }
  }

  private async metaResponse(request: ModelRequest, route: ModelRoute): Promise<ModelTurn> {
    const replay = request.continuation as ReplayState | undefined;
    if (replay && (replay.provider !== "meta" || replay.model !== route.model)) throw new AgentError("INVALID_INPUT", "Model continuation belongs to another route.");
    const input: ResponseInputItem[] = replay ? [...replay.items] : [];
    let newMessages = request.messages.slice(replay?.consumedMessages ?? 0);
    // Raw output items were already replayed intact; skip the runtime's plain assistant projection.
    if (replay && newMessages[0]?.role === "assistant") newMessages = newMessages.slice(1);
    for (const message of newMessages) input.push(...messageItems(message));
    if (!replay && request.imageDataUrl) input.push({ role: "user", content: [{ type: "input_image", image_url: request.imageDataUrl, detail: "auto" }] });
    const tools: NonNullable<ResponseCreateParamsNonStreaming["tools"]> = request.tools.map((tool) => ({ type: "function", name: tool.name, description: tool.description, parameters: tool.parameters, strict: false }));
    if (request.webSearch) tools.push({ type: "web_search", search_context_size: "medium" });
    const params: ResponseCreateParamsNonStreaming = {
      model: route.model, input, store: false, stream: false,
      include: ["reasoning.encrypted_content"], reasoning: { effort: route.effort },
      max_output_tokens: request.maxOutputTokens,
      ...(tools.length ? { tools, parallel_tool_calls: false } : {}),
      ...(request.webSearch ? { max_tool_calls: Math.min(5, Math.max(1, request.maxBuiltInToolCalls ?? 5)) } : {}),
      // JSON prompting + local schema validation is used because provider schema dialects differ.
    };
    const response = request.onEvent
      ? await readMetaResponseStream(await this.client("meta").responses.create({ ...params, stream: true }, { signal: request.signal }), request)
      : await this.client("meta").responses.create(params, { signal: request.signal });
    const citations: Array<{ url: string; title: string }> = [];
    let text = "";
    const toolCalls = [];
    for (const item of response.output) {
      if (item.type === "function_call") toolCalls.push({ id: item.call_id, name: item.name, arguments: item.arguments });
      // Search and tool responses can contain preambles tagged as commentary.
      // They are replayed intact below, but are not part of the final JSON answer
      // and their citations must not establish provenance for that answer.
      // Meta final messages have no phase; explicit final_answer is compatible too.
      if (item.type === "message" && item.phase !== "commentary") for (const block of item.content) {
        if (block.type !== "output_text") continue;
        text += block.text;
        for (const annotation of block.annotations ?? []) if (annotation.type === "url_citation") citations.push({ url: annotation.url, title: annotation.title });
      }
    }
    if (response.status === "incomplete" && !toolCalls.length) throw new AgentError("BUDGET_EXCEEDED", "The model exhausted its output budget before finishing the response.");
    // Only complete encrypted reasoning items can be replayed. Never expose their contents in AgentResult.
    const output = response.output.filter((item: ResponseOutputItem) => item.type !== "reasoning" || Boolean(item.encrypted_content));
    return {
      text, toolCalls, provider: "meta", model: route.model, citations, searchPerformed: response.output.some((item) => item.type === "web_search_call"),
      builtInToolCalls: response.output.filter((item) => item.type === "web_search_call").length,
      continuation: { items: [...input, ...output] as ResponseInputItem[], consumedMessages: request.messages.length, provider: "meta", model: route.model } satisfies ReplayState,
      usage: { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 },
    };
  }

  private async basetenChat(request: ModelRequest, route: ModelRoute): Promise<ModelTurn> {
    // Baseten is used for bounded metadata extraction, not silently substituted for Meta search/agent replay.
    if (request.tools.length || request.webSearch || request.imageDataUrl) throw new AgentError("CAPABILITY_UNAVAILABLE", "This Baseten adapter is configured for bounded text metadata extraction only.");
    const messages: ChatCompletionMessageParam[] = request.messages.map((message) => {
      if (message.role === "tool") return { role: "tool", content: message.content, tool_call_id: message.toolCallId! };
      return { role: message.role === "developer" ? "system" : message.role, content: message.content };
    });
    const params = {
      model: BASETEN_HACKATHON_MODEL, messages, reasoning_effort: route.effort,
      max_tokens: request.maxOutputTokens, response_format: { type: "json_object" as const },
    };
    if (request.onEvent) return readBasetenChatStream(await this.client("baseten").chat.completions.create({ ...params, stream: true, stream_options: { include_usage: true } }, { signal: request.signal }), request, BASETEN_HACKATHON_MODEL);
    const response = await this.client("baseten").chat.completions.create({ ...params, stream: false }, { signal: request.signal });
    if (response.choices[0]?.finish_reason === "length") throw new AgentError("BUDGET_EXCEEDED", "The metadata model exhausted its output budget.");
    // Baseten's reasoning_content is intentionally neither surfaced nor logged.
    return { text: response.choices[0]?.message.content ?? "", toolCalls: [], provider: "baseten", model: BASETEN_HACKATHON_MODEL,
      usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 } };
  }
}

export function createModelFromEnvironment(env: NodeJS.ProcessEnv = process.env): OpenAICompatibleAgentModel {
  return new OpenAICompatibleAgentModel({ metaApiKey: env.META_API_KEY || env.MODEL_API_KEY, basetenApiKey: env.BASETEN_API_KEY, routes: routingFromEnvironment(env) });
}

/** ASR uses Meta's own multipart endpoint; it is not an OpenAI audio endpoint. No TTS model is assumed. */
export async function transcribeMetaAudio(audio: Blob, options: { signal?: AbortSignal; apiKey?: string; fetch?: typeof fetch; onEvent?: (event: AgentEvent) => void } = {}) {
  await validateMetaWav(audio);
  const apiKey = options.apiKey ?? (process.env.META_API_KEY || process.env.MODEL_API_KEY);
  if (!apiKey) throw new AgentError("CONFIGURATION", "Meta transcription is not configured.");
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify({ model: "muse-voice-transcribe-1.0", mode: "PUSH_TO_TALK", audioEncoding: "WAV", ...(options.onEvent ? { partialMode: "CUMULATIVE", emitAudioProgress: true } : {}) })], { type: "application/json" }));
  form.append("audio", audio, "input.wav");
  const signal = AbortSignal.any([AbortSignal.timeout(60_000), ...(options.signal ? [options.signal] : [])]);
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(`${META_BASE_URL}/asr/transcribe`, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, ...(options.onEvent ? { accept: "text/event-stream" } : {}) }, body: form, signal });
  } catch {
    throw new AgentError(options.signal?.aborted ? "CANCELLED" : "PROVIDER", options.signal?.aborted ? "Transcription was cancelled." : "The transcription service could not complete the request.", !options.signal?.aborted);
  }
  if (!response.ok) throw new AgentError("PROVIDER", `Meta transcription failed (HTTP ${response.status}).`, response.status === 429 || response.status >= 500);
  if (options.onEvent) {
    if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new AgentError("INVALID_OUTPUT", "Meta did not return the requested transcription stream.");
    const transcript = await readTranscriptionStream(response.body, signal, options.onEvent);
    return { transcript, provider: "meta" as const, model: "muse-voice-transcribe-1.0", mode: "live" as const };
  }
  const body = await response.json().catch(() => null) as { transcript?: unknown } | null;
  if (typeof body?.transcript !== "string" || body.transcript.length > 50_000) throw new AgentError("INVALID_OUTPUT", "Meta did not return a valid transcript.");
  return { transcript: body.transcript, provider: "meta" as const, model: "muse-voice-transcribe-1.0", mode: "live" as const };
}
