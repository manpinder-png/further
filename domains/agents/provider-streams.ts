import type { Response as MetaResponse, ResponseOutputItem, ResponseStreamEvent } from "openai/resources/responses/responses";
import type { ChatCompletionChunk } from "openai/resources/chat/completions/completions";
import { AgentError, type ModelRequest, type ModelTurn } from "./contracts.ts";

type CancellableStream<T> = AsyncIterable<T> & { controller: AbortController };
const MAX_STREAM_BYTES = 128_000;

/** Reads only final-answer text deltas. Raw terminal output stays server-side so
 * encrypted reasoning and commentary can be replayed intact on the next turn. */
export async function readMetaResponseStream(stream: CancellableStream<ResponseStreamEvent>, request: ModelRequest): Promise<MetaResponse> {
  const phases = new Map<string, "final" | "commentary" | "other">();
  const pending = new Map<string, string>();
  const textSeen = new Set<string>();
  const startedSearches = new Set<string>(), completedSearches = new Set<string>();
  let textBytes = 0;
  let terminal: MetaResponse | undefined;
  const emitText = (delta: string) => { if (delta && !request.signal.aborted) request.onEvent?.({ type: "text_delta", delta }); };
  const searchStarted = (id: string) => {
    if (startedSearches.has(id)) return;
    startedSearches.add(id);
    if (startedSearches.size > (request.maxBuiltInToolCalls ?? 5)) throw new AgentError("BUDGET_EXCEEDED", "The built-in search tool budget was exceeded.");
    request.onEvent?.({ type: "activity", phase: "tool_started", label: "Searching for sources", toolName: "web_search" });
  };
  const searchCompleted = (id: string) => {
    if (completedSearches.has(id)) return;
    searchStarted(id); completedSearches.add(id);
    request.onEvent?.({ type: "activity", phase: "tool_completed", label: "Source search finished", toolName: "web_search" });
  };
  const item = (output: ResponseOutputItem, done = false) => {
    if (output.type === "web_search_call") { if (done) searchCompleted(output.id); else searchStarted(output.id); }
    if (output.type !== "message") { if ("id" in output && typeof output.id === "string") phases.set(output.id, "other"); return; }
    const phase = output.phase === "commentary" ? "commentary" : "final";
    phases.set(output.id, phase);
    const buffered = pending.get(output.id);
    if (buffered && phase === "final") emitText(buffered);
    pending.delete(output.id);
    // Some compatible servers emit a completed item without deltas. The actual
    // done event may be displayed once; no artificial token timing is added.
    if (done && !textSeen.has(output.id) && phase === "final") {
      for (const block of output.content) if (block.type === "output_text") emitText(block.text);
      textSeen.add(output.id);
    }
  };
  try {
    for await (const event of stream) {
      if (request.signal.aborted) throw new AgentError("CANCELLED", "The model request was cancelled.");
      switch (event.type) {
        case "response.created": request.onEvent?.({ type: "activity", phase: "waiting", label: "Model connection established" }); break;
        case "response.output_item.added": item(event.item); break;
        case "response.output_item.done": item(event.item, true); break;
        case "response.output_text.delta": {
          textBytes += Buffer.byteLength(event.delta);
          if (textBytes > MAX_STREAM_BYTES) throw new AgentError("BUDGET_EXCEEDED", "The streamed answer exceeds this run's output limit.");
          textSeen.add(event.item_id);
          const phase = phases.get(event.item_id);
          if (phase === "final") emitText(event.delta);
          else if (!phase) pending.set(event.item_id, (pending.get(event.item_id) ?? "") + event.delta);
          break;
        }
        case "response.web_search_call.in_progress":
        case "response.web_search_call.searching": searchStarted(event.item_id); break;
        case "response.web_search_call.completed": searchCompleted(event.item_id); break;
        case "response.completed":
        case "response.incomplete": terminal = event.response; break;
        case "response.failed":
        case "error": throw new AgentError("PROVIDER", "The model stream could not complete the response.", true);
        // Reasoning, summaries, arguments, annotations and opaque replay events
        // never pass through the public progress callback.
      }
      if (terminal) { for (const output of terminal.output) item(output, true); break; }
    }
    if (request.signal.aborted) throw new AgentError("CANCELLED", "The model request was cancelled.");
    if (!terminal) throw new AgentError("PROVIDER", "The model stream ended before a final response arrived.", true);
    return terminal;
  } finally { stream.controller.abort(); }
}

export async function readBasetenChatStream(stream: CancellableStream<ChatCompletionChunk>, request: ModelRequest, model: string): Promise<ModelTurn> {
  let text = "", bytes = 0, finishReason: string | null = null;
  let usage = { inputTokens: 0, outputTokens: 0 }, connected = false;
  try {
    for await (const chunk of stream) {
      if (request.signal.aborted) throw new AgentError("CANCELLED", "The model request was cancelled.");
      if (!connected) { connected = true; request.onEvent?.({ type: "activity", phase: "waiting", label: "Model connection established" }); }
      if (chunk.usage) usage = { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens };
      const choice = chunk.choices.find(c => c.index === 0);
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      if (choice.delta.tool_calls?.length) throw new AgentError("TOOL_DENIED", "The metadata stream requested an unsupported tool.");
      // Baseten reasoning_content is deliberately not inspected, stored or emitted.
      if (typeof choice.delta.content === "string") {
        bytes += Buffer.byteLength(choice.delta.content);
        if (bytes > MAX_STREAM_BYTES) throw new AgentError("BUDGET_EXCEEDED", "The metadata response exceeds this run's output limit.");
        text += choice.delta.content;
        request.onEvent?.({ type: "text_delta", delta: choice.delta.content });
      }
    }
    if (request.signal.aborted) throw new AgentError("CANCELLED", "The model request was cancelled.");
    if (finishReason === "length") throw new AgentError("BUDGET_EXCEEDED", "The metadata model exhausted its output budget.");
    if (finishReason !== "stop") throw new AgentError("PROVIDER", "The metadata stream ended without a complete answer.", true);
    return { text, toolCalls: [], provider: "baseten", model, usage };
  } finally { stream.controller.abort(); }
}
