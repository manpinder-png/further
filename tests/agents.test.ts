import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgentRuntime } from "../domains/agents/runtime.ts";
import { FixtureAgentModel } from "../domains/agents/fixture-model.ts";
import { AgentError, type AgentModel, type AgentTools, type ModelRequest, type ModelTurn } from "../domains/agents/contracts.ts";

const actor = { actorId: "actor-a", correlationId: "trace-a" };
const metadata = { intent: "Understand GPUs", goals: ["Understand parallel work"], concepts: [{ slug: "gpu", title: "GPUs", confidence: 0.8 }], experience: "unknown", language: null, availableMinutes: null, participation: "unknown", matchingText: "GPUs parallel work", uncertainty: ["Time available is not supplied."] };
const map = { intent: "Understand GPUs", root: "gpu", rootTitle: "GPUs", concepts: [{ slug: "gpu", title: "GPUs", hook: "Many simple tasks at once.", difficulty: 0.4 }], explanation: "Start with parallel work.", recommendedPeerIds: [], nextActions: ["Explore one example"] };
const peer = { id: "peer-b", displayName: "Learner B", reason: "Shared concept and overlapping time.", sharedConcepts: ["gpu"], complementaryConcepts: ["parallelism"], score: 0.8 };
const ports: AgentTools = { getMap: async () => ({ concepts: [] }), findPeers: async () => [peer] };
const turn = (data: unknown): ModelTurn => ({ text: JSON.stringify(data), toolCalls: [], provider: "meta", model: "muse-spark-1.3", usage: { inputTokens: 10, outputTokens: 20 } });
class QueueModel implements AgentModel {
  readonly requests: ModelRequest[] = [];
  constructor(private queue: Array<ModelTurn | Error>) {}
  async complete(request: ModelRequest) { this.requests.push(request); const next = this.queue.shift(); if (next instanceof Error) throw next; assert.ok(next, "Unexpected model call"); return next; }
}

test("metadata is independently callable and preserves unknowns", async () => {
  const model = new QueueModel([turn(metadata)]);
  const result = await createAgentRuntime({ model, tools: ports }).invoke("metadata", { text: "How do GPUs work?" }, actor);
  assert.equal(result.data.availableMinutes, null);
  assert.equal(result.data.experience, "unknown");
  assert.equal(result.usage.modelCalls, 1);
  assert.equal(result.usage.toolCalls, 0);
  assert.equal(result.correlationId, actor.correlationId);
  assert.equal(result.contractVersion, "1.0");
});

test("knowledge-map performs a real tool loop and delegates metadata with one identity and budget", async () => {
  const seen: string[] = [];
  const model = new QueueModel([
    { ...turn(null), text: "", toolCalls: [{ id: "read", name: "get_map", arguments: "{}" }, { id: "infer", name: "infer_metadata", arguments: '{"text":"How do GPUs work?"}' }] },
    turn(metadata), turn(map),
  ]);
  const result = await createAgentRuntime({ model, tools: { ...ports, getMap: async (ctx) => { seen.push(ctx.actorId, ctx.correlationId); return { concepts: [] }; } } })
    .invoke("knowledge-map", { text: "How do GPUs work?" }, actor);
  assert.deepEqual(seen, ["actor-a", "trace-a"]);
  assert.equal(result.usage.modelCalls, 3);
  assert.equal(result.usage.toolCalls, 2);
  assert.ok(result.trace.some((e) => e.kind === "delegate" && e.name === "metadata"));
  assert.ok(model.requests[2].messages.some((m) => m.role === "tool" && m.toolCallId === "infer"));
  assert.equal(result.data.concepts[0].slug, "gpu");
  assert.deepEqual(result.artifacts, [{ agentId: "metadata", data: metadata, provider: "meta", model: "muse-spark-1.3" }]);
  assert.equal(result.artifacts.some((item) => "get_map" === String(item.agentId)), false);
});

test("peer guide returns eligible server candidates without a model or invented people", async () => {
  const model = new QueueModel([]);
  const result = await createAgentRuntime({ model, tools: ports }).invoke("peer-guide", { query: "GPUs", limit: 1 }, actor);
  assert.equal(result.provider, "local");
  assert.equal(result.usage.modelCalls, 0);
  assert.deepEqual(result.data.peers, [peer]);
});

test("no eligible peers preserves the no-match outcome", async () => {
  const runtime = createAgentRuntime({ model: new QueueModel([]), tools: { ...ports, findPeers: async () => [] } });
  const result = await runtime.invoke("peer-guide", {}, actor);
  assert.equal(result.data.status, "none");
  assert.deepEqual(result.data.peers, []);
});

test("knowledge-map refuses invented peer identifiers even after repair", async () => {
  const bad = { ...map, recommendedPeerIds: ["invented-person"] };
  const model = new QueueModel([
    { ...turn(null), toolCalls: [{ id: "read", name: "get_map", arguments: "{}" }, { id: "infer", name: "infer_metadata", arguments: '{"text":"GPUs"}' }] },
    turn(metadata), turn(bad), turn(bad),
  ]);
  await assert.rejects(createAgentRuntime({ model, tools: ports }).invoke("knowledge-map", { text: "GPUs" }, actor), (err: unknown) => err instanceof AgentError && err.code === "INVALID_OUTPUT");
});

test("shared model-call budget includes delegated agents", async () => {
  const model = new QueueModel([
    { ...turn(null), toolCalls: [{ id: "infer", name: "infer_metadata", arguments: '{"text":"GPUs"}' }] },
  ]);
  await assert.rejects(createAgentRuntime({ model, tools: ports }).invoke("knowledge-map", { text: "GPUs" }, { ...actor, budget: { maxModelCalls: 1 } }), (err: unknown) => err instanceof AgentError && err.code === "BUDGET_EXCEEDED");
  assert.equal(model.requests.length, 1);
});

test("tool allowlist prevents arbitrary actions and inherited property names", async () => {
  for (const name of ["delete_everything", "toString"]) {
    const model = new QueueModel([{ ...turn(null), toolCalls: [{ id: "bad", name, arguments: "{}" }] }]);
    await assert.rejects(createAgentRuntime({ model, tools: ports }).invoke("knowledge-map", { text: "GPUs" }, actor), (err: unknown) => err instanceof AgentError && err.code === "TOOL_DENIED");
  }
});

test("untrusted actor arguments cannot be added to tools", async () => {
  const model = new QueueModel([{ ...turn(null), toolCalls: [{ id: "bad", name: "get_map", arguments: '{"actorId":"someone-else"}' }] }]);
  await assert.rejects(createAgentRuntime({ model, tools: ports }).invoke("knowledge-map", { text: "GPUs" }, actor), (err: unknown) => err instanceof AgentError && err.code === "INVALID_INPUT");
});

test("aborted invocation never calls a provider", async () => {
  const model = new QueueModel([]);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createAgentRuntime({ model, tools: ports }).invoke("metadata", { text: "GPUs" }, { ...actor, signal: controller.signal }), (err: unknown) => err instanceof AgentError && err.code === "CANCELLED");
  assert.equal(model.requests.length, 0);
});

test("timeout stops a model that ignores cancellation", async () => {
  const model: AgentModel = { complete: async () => new Promise(() => {}) };
  await assert.rejects(createAgentRuntime({ model, tools: ports }).invoke("metadata", { text: "GPUs" }, { ...actor, budget: { timeoutMs: 20 } }), (err: unknown) => err instanceof AgentError && err.code === "CANCELLED");
});

test("live failures remain failures instead of becoming fixture content", async () => {
  const model = new QueueModel([new AgentError("PROVIDER", "Meta unavailable", true)]);
  await assert.rejects(createAgentRuntime({ model, tools: ports }).invoke("metadata", { text: "GPUs" }, actor), /Meta unavailable/);
  const fixture = createAgentRuntime({ model: new FixtureAgentModel(), tools: ports });
  await assert.rejects(fixture.invoke("metadata", { text: "GPUs" }, actor), (err: unknown) => err instanceof AgentError && err.code === "PROVIDER");
});

test("explicit fixture mode exercises agent collaboration without network inference", async () => {
  const result = await createAgentRuntime({ model: new FixtureAgentModel(), tools: ports, mode: "fixture" }).invoke("knowledge-map", { text: "GPUs", objective: "recommend" }, actor);
  assert.equal(result.mode, "fixture");
  assert.equal(result.provider, "fixture");
  assert.deepEqual(result.data.recommendedPeerIds, ["peer-b"]);
  assert.ok(result.trace.some((e) => e.name === "metadata" && e.kind === "delegate"));
  assert.ok(result.trace.some((e) => e.name === "peer-guide" && e.kind === "delegate"));
  assert.equal(result.usage.inputTokens, 0);
});

test("resource guide derives its links from provider citations, not invented URLs", async () => {
  const model = new QueueModel([{ ...turn({ answer: "An official reference", sources: [{ url: "https://invented.invalid/", title: "Invented" }], grounded: true }), citations: [{ url: "https://dev.meta.ai/docs/models", title: "Models" }], searchPerformed: true }]);
  const result = await createAgentRuntime({ model, tools: ports }).invoke("resource-guide", { query: "Meta models" }, actor);
  assert.deepEqual(result.data.sources, [{ url: "https://dev.meta.ai/docs/models", title: "Models" }]);
  assert.equal(result.data.grounded, true);
});

test("resource guide fails without citations and perception accepts only supplied image data", async () => {
  const model = new QueueModel([turn({ answer: "A claim", sources: [], grounded: true })]);
  await assert.rejects(createAgentRuntime({ model, tools: ports }).invoke("resource-guide", { query: "Meta models" }, actor), (err: unknown) => err instanceof AgentError && err.code === "INVALID_OUTPUT");
  await assert.rejects(createAgentRuntime({ model, tools: ports }).invoke("perception", { imageDataUrl: "http://localhost/private" }, actor), (err: unknown) => err instanceof AgentError && err.code === "INVALID_INPUT");
});

test("resource guide normalizes cited prose including leading Markdown links without trusting authored URLs", async () => {
  const citation = { url: "https://docs.nvidia.com/cuda/cuda-c-programming-guide/", title: "CUDA Programming Guide" };
  for (const answer of ["Shared memory belongs to a thread block.", `[CUDA documentation](${citation.url}) describes shared memory.`]) {
    const model = new QueueModel([{ ...turn(null), text: answer, citations: [citation], searchPerformed: true, builtInToolCalls: 1 }]);
    const result = await createAgentRuntime({ model, tools: ports }).invoke("resource-guide", { query: "CUDA shared memory" }, actor);
    assert.deepEqual(result.data, { answer, sources: [citation], grounded: true });
    assert.equal(model.requests.length, 1);
    assert.match(model.requests[0].messages[0].content, /natural cited prose/);
    assert.doesNotMatch(model.requests[0].messages[0].content, /Return only JSON/);
  }
  for (const provenance of [{ citations: [], searchPerformed: true }, { citations: [citation], searchPerformed: false }]) {
    const model = new QueueModel([{ ...turn(null), text: `[CUDA documentation](${citation.url}) describes shared memory.`, ...provenance }]);
    await assert.rejects(createAgentRuntime({ model, tools: ports }).invoke("resource-guide", { query: "CUDA" }, actor), (e: unknown) => e instanceof AgentError && e.code === "INVALID_OUTPUT");
    assert.equal(model.requests.length, 1, "A missing citation must not trigger another paid search");
  }
});

test("opaque source markers confer no provenance and are cleaned from validated resource text", async () => {
  const text = "Shared memory†3063127099455466191†L34-L36. A†B is unchanged.";
  const citation = { url: "https://docs.nvidia.com/cuda/", title: "CUDA" };
  for (const citations of [[], [citation]]) {
    const runtime = createAgentRuntime({ model: new QueueModel([{ ...turn(null), text, searchPerformed: true, citations }]), tools: ports });
    const pending = runtime.invoke("resource-guide", { query: "CUDA" }, actor);
    if (citations.length) assert.equal((await pending).data.answer, "Shared memory. A†B is unchanged.");
    else await assert.rejects(pending, (e: unknown) => e instanceof AgentError && e.code === "INVALID_OUTPUT");
  }
});

test("learning companion keeps solo, facilitation and explain-back modes in one contract", async () => {
  for (const mode of ["solo", "facilitate", "explain-back"] as const) {
    const result = await createAgentRuntime({ model: new FixtureAgentModel(), tools: ports, mode: "fixture" }).invoke("learning-companion", { mode, concept: "GPUs" }, actor);
    assert.equal(result.data.mode, mode);
    assert.equal(result.data.score, null);
  }
});

test("trace contains action metadata, not input text or private reasoning", async () => {
  const model = new QueueModel([turn(metadata)]);
  const result = await createAgentRuntime({ model, tools: ports }).invoke("metadata", { text: "private-secret-question" }, actor);
  assert.equal(JSON.stringify(result.trace).includes("private-secret-question"), false);
  assert.equal("continuation" in result, false);
});

test("shared facilitation cannot load the caller's private learning or retrieval context", async () => {
  let privateReads = 0;
  const model = new QueueModel([turn({ mode: "facilitate", title: "Compare ideas", body: "Each person explain one step, then identify a shared question.", format: "discussion" })]);
  const result = await createAgentRuntime({ model, tools: { ...ports, getLearningContext: async () => { privateReads++; return { intent: "private health question", preferences: "private profile" }; } } })
    .invoke("learning-companion", { mode: "facilitate", concept: "GPUs", context: { participants: ["Learner A", "Learner B"] }, history: [{ role: "user", content: "How do parallel operations work?" }] }, actor);
  assert.equal(privateReads, 0);
  assert.equal(result.usage.toolCalls, 0);
  assert.equal(JSON.stringify(model.requests).includes("private health"), false);
  assert.equal(JSON.stringify(model.requests).includes("parallel operations"), true);
});

test("oversized arbitrary context is rejected before a provider call", async () => {
  const model = new QueueModel([]);
  await assert.rejects(createAgentRuntime({ model, tools: ports }).invoke("metadata", { text: "GPUs", context: { large: "x".repeat(130_000) } }, actor), (err: unknown) => err instanceof AgentError && err.code === "BUDGET_EXCEEDED");
  assert.equal(model.requests.length, 0);
});

test("timeout cancels a hanging private-context tool before any model call", async () => {
  const model = new QueueModel([]);
  await assert.rejects(createAgentRuntime({ model, tools: { ...ports, getLearningContext: async () => new Promise(() => {}) } }).invoke("learning-companion", { mode: "solo", concept: "GPUs" }, { ...actor, budget: { timeoutMs: 20 } }), (err: unknown) => err instanceof AgentError && err.code === "CANCELLED");
  assert.equal(model.requests.length, 0);
});

test("resource search actions consume the shared tool budget and are capped upstream", async () => {
  const response = { ...turn({ answer: "A sourced answer", sources: [], grounded: true }), citations: [{ url: "https://docs.pytorch.org/docs/stable/generated/torch.matmul.html", title: "torch.matmul" }], searchPerformed: true, builtInToolCalls: 2 };
  const model = new QueueModel([response]);
  const result = await createAgentRuntime({ model, tools: ports }).invoke("resource-guide", { query: "Matrix multiplication docs" }, { ...actor, budget: { maxToolCalls: 3 } });
  assert.equal(model.requests[0].maxBuiltInToolCalls, 3);
  assert.equal(result.usage.toolCalls, 2);
  assert.equal(result.trace.filter(t => t.kind === "tool" && t.name === "web_search").length, 2);
  await assert.rejects(createAgentRuntime({ model: new QueueModel([response]), tools: ports }).invoke("resource-guide", { query: "Matrix multiplication docs" }, { ...actor, budget: { maxToolCalls: 1 } }), (error: unknown) => error instanceof AgentError && error.code === "BUDGET_EXCEEDED");
});
