import { test } from "node:test";
import assert from "node:assert/strict";
import { JsonStringDraftParser, ResourceDraftParser, stripOpaqueSourceMarkers } from "../domains/agents/streaming-json.ts";
import { OpenAICompatibleAgentModel, routingFromEnvironment } from "../domains/agents/openai-provider.ts";
import { createAgentRuntime } from "../domains/agents/runtime.ts";
import { readTranscriptionStream } from "../domains/agents/transcription-stream.ts";
import { AgentError, type AgentEvent, type AgentModel, type ModelEvent, type ModelRequest, type ModelTurn } from "../domains/agents/contracts.ts";

const encoder = new TextEncoder();
const sse = (event: unknown) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
function responseStream(events: unknown[], done = true) {
  return new Response(new ReadableStream<Uint8Array>({ start(controller) { for (const e of events) controller.enqueue(sse(e)); if (done) controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); } }), { headers: { "content-type": "text/event-stream" } });
}
const metadata = { intent: "Understand GPUs", goals: [], concepts: [], experience: "unknown", language: null, availableMinutes: null, participation: "unknown", matchingText: "GPUs", uncertainty: [] };
const finalMessage = (text: string, id = "msg_final") => ({ id, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] });
const finalResponse = (output: unknown[]) => ({ id: "resp_test", object: "response", created_at: 1, status: "completed", model: "muse-spark-1.3", output, usage: { input_tokens: 12, output_tokens: 25 } });
const request = (onEvent: (event: ModelEvent) => void): ModelRequest => ({ agentId: "metadata", messages: [{ role: "user", content: "Return JSON" }], tools: [], signal: new AbortController().signal, maxOutputTokens: 1000, outputSchema: {}, onEvent });
const ports = { getMap: async () => ({ concepts: [] }), findPeers: async () => [] };

test("draft JSON lexer decodes fragmented escapes and surrogate pairs without syntax or nested fields", () => {
  const text = '{"hidden":"private", "body":"Line\\n\\\"quote\\\" \\uD83D\\uDE80 \\u00e9", "nested":{"answer":"never"},"items":[{"body":"never"}],"answer":"raw 🚀"}';
  for (const width of [1, 2, 3, 7, 200]) {
    const parser = new JsonStringDraftParser(), output: Record<string, string> = {};
    for (let i = 0; i < text.length; i += width) for (const part of parser.push(text.slice(i, i + width))) output[part.field] = (output[part.field] ?? "") + part.delta;
    assert.deepEqual(output, { body: 'Line\n"quote" 🚀 é', answer: "raw 🚀" });
  }
  const parser = new JsonStringDraftParser();
  assert.deepEqual(parser.push('{"body":"\\uD83D'), []);
  assert.deepEqual(parser.push('\\uDE80"}'), [{ field: "body", delta: "🚀" }]);
  assert.throws(() => new JsonStringDraftParser().push("x".repeat(128001)), (e: unknown) => e instanceof AgentError && e.code === "BUDGET_EXCEEDED");
});

test("resource drafts preserve cited prose and fragmented Unicode while extracting only answer from structured mocks", () => {
  const answer = "[CUDA documentation](https://docs.nvidia.com/cuda/) explains shared memory. 🚀";
  for (const source of [answer, JSON.stringify({ answer, sources: [{ url: "hidden" }], grounded: true }), `\`\`\`json\n${JSON.stringify({ answer })}\n\`\`\``]) {
    for (const width of [1, 2, 3, 13, 200]) {
      const parser = new ResourceDraftParser(); const received: string[] = [];
      for (let i = 0; i < source.length; i += width) for (const part of parser.push(source.slice(i, i + width))) {
        assert.equal(part.field, "answer");
        assert.equal(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(part.delta), false);
        received.push(part.delta);
      }
      assert.equal(received.join(""), answer);
    }
  }
  assert.throws(() => new ResourceDraftParser().push("x".repeat(128001)), (e: unknown) => e instanceof AgentError && e.code === "BUDGET_EXCEEDED");
});

test("resource display suppresses only observed opaque markers across fragments and preserves dagger math and footnotes", () => {
  const source = "GPU†7290353104110793276†L8-L11. Shared memory†3063127099455466191†L34-L36. A†B; note†12; short†123456789012345†L8-L11; standalone†; partial†123";
  const expected = "GPU. Shared memory. A†B; note†12; short†123456789012345†L8-L11; standalone†; partial†123";
  assert.equal(stripOpaqueSourceMarkers(source), expected);
  for (const raw of [source, JSON.stringify({ answer: source })]) for (const width of [1, 2, 3, 17, 300]) {
    const parser = new ResourceDraftParser(); const chunks: string[] = [];
    for (let i = 0; i < raw.length; i += width) chunks.push(...parser.push(raw.slice(i, i + width)).map(p => p.delta));
    chunks.push(...parser.finish().map(p => p.delta));
    assert.equal(chunks.join(""), expected);
    assert.equal(chunks.join("").includes("7290353104110793276"), false);
  }
  const terminal = new ResourceDraftParser();
  assert.equal([...terminal.push("GPU†7290353104110793276†L8-L11"), ...terminal.finish()].map(p => p.delta).join(""), "GPU");
});

test("actual Meta SDK SSE delivers readable drafts before final completion and excludes commentary/reasoning", async () => {
  let release!: () => void, firstDraft!: () => void;
  const gate = new Promise<void>(r => { release = r; }), seenDraft = new Promise<void>(r => { firstDraft = r; });
  const events: AgentEvent[] = []; let completed = false, body: Record<string, unknown> = {};
  const transport: typeof fetch = async (_url, options) => {
    body = JSON.parse(String(options?.body));
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(sse({ type: "response.created", response: { id: "resp_test" } }));
      controller.enqueue(sse({ type: "response.output_item.added", output_index: 0, item: { ...finalMessage("", "commentary"), phase: "commentary" } }));
      controller.enqueue(sse({ type: "response.output_text.delta", item_id: "commentary", delta: '{"intent":"untrusted preamble"}' }));
      controller.enqueue(sse({ type: "response.reasoning_summary_text.delta", item_id: "reasoning", delta: "private chain of thought" }));
      controller.enqueue(sse({ type: "response.output_item.added", output_index: 1, item: finalMessage("") }));
      controller.enqueue(sse({ type: "response.output_text.delta", item_id: "msg_final", delta: '{"intent":"Under' }));
      controller.enqueue(sse({ type: "response.output_text.delta", item_id: "msg_final", delta: 'stand GPUs"' }));
      void gate.then(() => { controller.enqueue(sse({ type: "response.completed", response: finalResponse([finalMessage(JSON.stringify(metadata))]) })); controller.close(); });
    } }), { headers: { "content-type": "text/event-stream" } });
  };
  const model = new OpenAICompatibleAgentModel({ metaApiKey: "fake", routes: routingFromEnvironment({}), fetch: transport });
  const pending = createAgentRuntime({ model, tools: ports }).invoke("metadata", { text: "GPUs" }, { actorId: "actor", onEvent: event => { events.push(event); if (events.filter(e => e.type === "text_delta" && e.delta).length >= 2) firstDraft(); } }).then(result => { completed = true; return result; });
  await seenDraft;
  assert.equal(completed, false); assert.equal(body.stream, true);
  assert.equal(JSON.stringify(events).includes("untrusted preamble"), false); assert.equal(JSON.stringify(events).includes("chain of thought"), false);
  assert.equal(events.filter(e => e.type === "text_delta" && !e.replace).map(e => e.type === "text_delta" ? e.delta : "").join(""), "Understand GPUs");
  release(); const result = await pending;
  assert.equal(result.data.intent, metadata.intent); assert.equal(result.usage.inputTokens, 12);
  assert.deepEqual(events.map(e => e.sequence), events.map((_e, i) => i + 1));
});

test("streamed Meta tool delegation preserves opaque replay and emits actual tool lifecycle", async () => {
  const requests: Array<Record<string, unknown>> = [], events: AgentEvent[] = [];
  const map = { intent: "GPUs", root: "gpu", rootTitle: "GPUs", concepts: [{ slug: "gpu", title: "GPUs", hook: "Parallel work", difficulty: .4 }], explanation: "Start here.", recommendedPeerIds: [], nextActions: [] };
  const transport: typeof fetch = async (_url, options) => {
    requests.push(JSON.parse(String(options?.body)));
    const output = requests.length === 1 ? [
      { id: "rs_1", type: "reasoning", summary: [], encrypted_content: "opaque-not-public" },
      { ...finalMessage("Read map", "pre"), phase: "commentary" },
      { id: "fc_1", type: "function_call", call_id: "read", name: "get_map", arguments: "{}", status: "completed" },
      { id: "fc_2", type: "function_call", call_id: "infer", name: "infer_metadata", arguments: '{"text":"GPUs"}', status: "completed" },
    ] : [finalMessage(JSON.stringify(requests.length === 2 ? metadata : map))];
    return responseStream([{ type: "response.completed", response: finalResponse(output) }]);
  };
  const model = new OpenAICompatibleAgentModel({ metaApiKey: "fake", routes: routingFromEnvironment({}), fetch: transport });
  const result = await createAgentRuntime({ model, tools: ports }).invoke("knowledge-map", { text: "GPUs" }, { actorId: "actor", onEvent: event => events.push(event) });
  assert.equal(result.usage.modelCalls, 3);
  const replay = requests[2].input as Array<Record<string, unknown>>;
  assert.equal(replay.find(i => i.id === "rs_1")?.encrypted_content, "opaque-not-public");
  assert.equal(replay.find(i => i.id === "pre")?.phase, "commentary");
  assert.equal(replay.filter(i => i.type === "function_call_output").length, 2);
  assert.ok(events.some(e => e.type === "activity" && e.phase === "delegating" && e.targetAgentId === "metadata"));
  assert.ok(events.some(e => e.type === "activity" && e.phase === "tool_started" && e.toolName === "get_map"));
  assert.equal(JSON.stringify(events).includes("opaque-not-public"), false);
});

test("Baseten streaming accumulates content/usage but never reasoning and requires a terminal finish reason", async () => {
  let body: Record<string, unknown> = {}; const seen: ModelEvent[] = [];
  const chunk = (content: unknown, finish_reason: string | null = null) => ({ id: "chat_test", object: "chat.completion.chunk", created: 1, model: "meta-models/muse-spark-open-1026", choices: [{ index: 0, delta: content, finish_reason }] });
  const transport: typeof fetch = async (_url, options) => { body = JSON.parse(String(options?.body)); return responseStream([
    chunk({ reasoning_content: "private reasoning" }), chunk({ content: '{"intent":"' }), chunk({ content: 'GPUs"}' }, "stop"),
    { choices: [], usage: { prompt_tokens: 13, completion_tokens: 21, total_tokens: 34 } },
  ]); };
  const model = new OpenAICompatibleAgentModel({ basetenApiKey: "fake", routes: routingFromEnvironment({ FURTHER_METADATA_PROVIDER: "baseten" }), fetch: transport });
  const result = await model.complete(request(e => seen.push(e)));
  assert.equal(body.stream, true); assert.deepEqual(body.stream_options, { include_usage: true });
  assert.equal(result.text, '{"intent":"GPUs"}'); assert.deepEqual(result.usage, { inputTokens: 13, outputTokens: 21 });
  assert.equal(JSON.stringify(seen).includes("private reasoning"), false);
  for (const reason of [null, "length", "content_filter"]) {
    const failing = new OpenAICompatibleAgentModel({ basetenApiKey: "fake", routes: routingFromEnvironment({ FURTHER_METADATA_PROVIDER: "baseten" }), fetch: async () => responseStream([chunk({ content: "{}" }, reason)]) });
    await assert.rejects(failing.complete(request(() => {})), (error: unknown) => error instanceof AgentError && error.code === (reason === "length" ? "BUDGET_EXCEEDED" : "PROVIDER"));
  }
});

test("repair turns reset provisional drafts and never emit after cancellation", async () => {
  const events: AgentEvent[] = []; let calls = 0;
  const model: AgentModel = { complete: async req => { calls++; req.onEvent?.({ type: "text_delta", delta: `{"intent":"${calls === 1 ? "Wrong draft" : "Understand GPUs"}"}` }); return { text: JSON.stringify(calls === 1 ? { intent: "Wrong draft" } : metadata), toolCalls: [], provider: "meta", model: "muse-spark-1.3" }; } };
  const result = await createAgentRuntime({ model, tools: ports }).invoke("metadata", { text: "GPUs" }, { actorId: "actor", onEvent: e => events.push(e) });
  assert.equal(result.data.intent, "Understand GPUs");
  assert.equal(events.filter(e => e.type === "text_delta" && e.field === "intent" && e.replace).length, 2);
  const abort = new AbortController(); let captured: ModelRequest | undefined;
  const hanging: AgentModel = { complete: async req => { captured = req; req.onEvent?.({ type: "text_delta", delta: '{"intent":"Partial' }); return new Promise<ModelTurn>(() => {}); } };
  const received: AgentEvent[] = [];
  const pending = createAgentRuntime({ model: hanging, tools: ports }).invoke("metadata", { text: "GPUs" }, { actorId: "actor", signal: abort.signal, onEvent: e => { received.push(e); if (e.type === "text_delta" && e.delta) abort.abort(); } });
  await assert.rejects(pending, (e: unknown) => e instanceof AgentError && e.code === "CANCELLED");
  const count = received.length; captured?.onEvent?.({ type: "text_delta", delta: ' after cancellation"}' });
  assert.equal(received.length, count); assert.equal(captured?.signal.aborted, true);
});

test("Meta stream rejects truncation and excludes unknown-phase text until its item is identified", async () => {
  const seen: ModelEvent[] = [];
  const model = new OpenAICompatibleAgentModel({ metaApiKey: "fake", routes: routingFromEnvironment({}), fetch: async () => responseStream([
    { type: "response.output_text.delta", item_id: "late", delta: '{"intent":"commentary"}' },
    { type: "response.output_item.added", item: { ...finalMessage("", "late"), phase: "commentary" } },
  ]) });
  await assert.rejects(model.complete(request(e => seen.push(e))), (e: unknown) => e instanceof AgentError && e.code === "PROVIDER");
  assert.equal(seen.some(e => e.type === "text_delta"), false);
});

test("ASR decodes fragmented UTF-8, replaces cumulative text and requires final:true", async () => {
  const transcriptEvents: AgentEvent[] = [];
  const wire = sse({ type: "transcript", transcript: "café 🚀", final: false });
  const last = sse({ type: "transcript", transcript: "café 🚀 complete", final: true });
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const byte of wire) c.enqueue(new Uint8Array([byte])); c.enqueue(sse({ type: "audioProgress", audioProcessedMs: 450 })); c.enqueue(last); c.close(); } });
  const result = await readTranscriptionStream(body, new AbortController().signal, e => transcriptEvents.push(e));
  assert.equal(result, "café 🚀 complete");
  assert.deepEqual(transcriptEvents.filter(e => e.type === "text_delta").map(e => e.type === "text_delta" ? [e.delta, e.replace] : []), [["café 🚀", true], ["café 🚀 complete", true]]);
  assert.ok(transcriptEvents.some(e => e.type === "activity" && e.audioProcessedMs === 450));
  await assert.rejects(readTranscriptionStream(responseStream([{ type: "transcript", transcript: "partial", final: false }]).body!, new AbortController().signal, () => {}), (e: unknown) => e instanceof AgentError && e.code === "PROVIDER");
});

test("SDK streaming abort closes the provider transport without a completed result", async () => {
  const abort = new AbortController(); let transportAborted = false;
  const model = new OpenAICompatibleAgentModel({ metaApiKey: "fake", routes: routingFromEnvironment({}), fetch: async (_url, options) => {
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      options?.signal?.addEventListener("abort", () => { transportAborted = true; controller.error(new DOMException("Aborted", "AbortError")); }, { once: true });
      controller.enqueue(sse({ type: "response.output_item.added", item: finalMessage("") }));
      controller.enqueue(sse({ type: "response.output_text.delta", item_id: "msg_final", delta: '{"intent":"Partial' }));
    } }), { headers: { "content-type": "text/event-stream" } });
  } });
  await assert.rejects(model.complete({ ...request(e => { if (e.type === "text_delta") abort.abort(); }), signal: abort.signal }), (e: unknown) => e instanceof AgentError && e.code === "CANCELLED");
  assert.equal(transportAborted, true);
});

test("ASR cancellation closes its reader and suppresses later events", async () => {
  const abort = new AbortController(); let cancelled = false, events = 0;
  const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(sse({ type: "transcript", transcript: "partial", final: false })); }, cancel() { cancelled = true; } });
  await assert.rejects(readTranscriptionStream(body, abort.signal, e => { events++; if (e.type === "text_delta") abort.abort(); }), (e: unknown) => e instanceof AgentError && e.code === "CANCELLED");
  assert.equal(cancelled, true); assert.equal(events, 2);
});

test("ASR final marker completes and cancels a connection that remains open", async () => {
  let cancelled = false;
  const events: AgentEvent[] = [];
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(sse({ type: "transcript", transcript: "A complete explanation", final: true })); },
    cancel() { cancelled = true; },
  });
  const transcript = await readTranscriptionStream(body, AbortSignal.timeout(1000), event => events.push(event));
  assert.equal(transcript, "A complete explanation");
  assert.equal(cancelled, true);
  assert.equal(events.filter(e => e.type === "text_delta").length, 1);
});

test("streamed built-in search stops when the shared action budget is exceeded", async () => {
  const model = new OpenAICompatibleAgentModel({ metaApiKey: "fake", routes: routingFromEnvironment({}), fetch: async () => responseStream([
    { type: "response.web_search_call.in_progress", item_id: "first" },
    { type: "response.web_search_call.completed", item_id: "first" },
    { type: "response.web_search_call.in_progress", item_id: "second" },
  ]) });
  await assert.rejects(model.complete({ ...request(() => {}), agentId: "resource-guide", webSearch: true, maxBuiltInToolCalls: 1 }), (e: unknown) => e instanceof AgentError && e.code === "BUDGET_EXCEEDED");
});
