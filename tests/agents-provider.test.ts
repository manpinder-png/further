import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenAICompatibleAgentModel, routingFromEnvironment, BASETEN_HACKATHON_MODEL } from "../domains/agents/openai-provider.ts";
import { AgentError, type ModelRequest } from "../domains/agents/contracts.ts";

const request = (overrides: Partial<ModelRequest> = {}): ModelRequest => ({
  agentId: "metadata", messages: [{ role: "developer", content: "Return JSON" }, { role: "user", content: "A question" }],
  tools: [], signal: new AbortController().signal, maxOutputTokens: 1500, outputSchema: { type: "object" }, ...overrides,
});
const modelReply = (output: unknown[]) => ({ id: "resp_test", object: "response", created_at: 1, status: "completed", model: "muse-spark-1.3", output, usage: { input_tokens: 12, output_tokens: 25 } });
const finalMessage = { id: "msg_final", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"ok":true}', annotations: [] }] };

test("Meta provider uses only the explicit endpoint and disables provider storage", async () => {
  let target = ""; let body: Record<string, unknown> = {};
  const transport: typeof fetch = async (url, init) => { target = String(url); body = JSON.parse(String(init?.body)); return Response.json(modelReply([finalMessage])); };
  const model = new OpenAICompatibleAgentModel({ metaApiKey: "test-key-not-real", routes: routingFromEnvironment({}), fetch: transport });
  const result = await model.complete(request());
  assert.equal(target, "https://api.meta.ai/v1/responses");
  assert.equal(body.model, "muse-spark-1.3");
  assert.equal(body.store, false);
  assert.deepEqual(body.include, ["reasoning.encrypted_content"]);
  assert.equal(result.text, '{"ok":true}');
  assert.equal(result.usage?.outputTokens, 25);
});

test("Meta tool continuation preserves opaque reasoning and pairs each function call exactly once", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const transport: typeof fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json(requests.length === 1 ? modelReply([
      { id: "rs_1", type: "reasoning", summary: [], encrypted_content: "opaque-test-ciphertext" },
      { id: "msg_preamble", type: "message", role: "assistant", status: "completed", phase: "commentary", content: [{ type: "output_text", text: "I will inspect the map.", annotations: [] }] },
      { id: "fc_1", type: "function_call", call_id: "call_1", name: "get_map", arguments: "{}", status: "completed" },
    ]) : modelReply([finalMessage]));
  };
  const model = new OpenAICompatibleAgentModel({ metaApiKey: "test-key-not-real", routes: routingFromEnvironment({}), fetch: transport });
  const first = request({ agentId: "knowledge-map", tools: [{ name: "get_map", description: "Read map", parameters: { type: "object", properties: {} } }] });
  const response = await model.complete(first);
  await model.complete({ ...first, continuation: response.continuation, messages: [...first.messages,
    { role: "assistant", content: "", toolCalls: response.toolCalls },
    { role: "tool", content: '{"concepts":[]}', toolCallId: "call_1" },
  ] });
  const items = requests[1].input as Array<Record<string, unknown>>;
  assert.equal(items.filter((i) => i.type === "function_call").length, 1);
  assert.equal(items.filter((i) => i.type === "function_call_output").length, 1);
  assert.equal(items.find((i) => i.type === "reasoning")?.encrypted_content, "opaque-test-ciphertext");
  assert.equal(items.find((i) => i.type === "function_call_output")?.call_id, "call_1");
  assert.equal(items.find((i) => i.id === "msg_preamble")?.phase, "commentary");
  assert.equal(response.text, "");
});

test("Meta search preambles cannot corrupt final JSON or supply final-answer citations", async () => {
  const final = { answer: "Matrix multiplication documentation.", sources: [], grounded: true };
  let body: Record<string, unknown> = {};
  const transport: typeof fetch = async (_url, options) => { body = JSON.parse(String(options?.body)); return Response.json(modelReply([
    { id: "msg_search", type: "message", role: "assistant", status: "completed", phase: "commentary", content: [{ type: "output_text", text: "I will search, then open the documentation.", annotations: [{ type: "url_citation", title: "Preamble only", url: "https://example.com/not-final", start_index: 0, end_index: 5 }] }] },
    { id: "search_1", type: "web_search_call", status: "completed" },
    { id: "msg_final", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(final), annotations: [{ type: "url_citation", title: "torch.matmul", url: "https://docs.pytorch.org/docs/stable/generated/torch.matmul.html", start_index: 12, end_index: 20 }] }] },
  ])); };
  const model = new OpenAICompatibleAgentModel({ metaApiKey: "test-key-not-real", routes: routingFromEnvironment({}), fetch: transport });
  const result = await model.complete(request({ agentId: "resource-guide", webSearch: true, maxBuiltInToolCalls: 3 }));
  assert.deepEqual(JSON.parse(result.text), final);
  assert.equal(result.searchPerformed, true);
  assert.equal(result.builtInToolCalls, 1);
  assert.equal(body.max_tool_calls, 3);
  assert.deepEqual(result.citations, [{ title: "torch.matmul", url: "https://docs.pytorch.org/docs/stable/generated/torch.matmul.html" }]);
});

test("Baseten metadata uses exact grant model, low effort and ignores private reasoning", async () => {
  let target = ""; let body: Record<string, unknown> = {};
  const transport: typeof fetch = async (url, init) => {
    target = String(url); body = JSON.parse(String(init?.body));
    return Response.json({ id: "chat_test", object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"ok":true}', reasoning_content: "private-thoughts" } }], usage: { prompt_tokens: 5, completion_tokens: 20 } });
  };
  const model = new OpenAICompatibleAgentModel({ basetenApiKey: "test-key-not-real", routes: routingFromEnvironment({ FURTHER_METADATA_PROVIDER: "baseten" }), fetch: transport });
  const result = await model.complete(request());
  assert.equal(target, "https://inference.baseten.co/v1/chat/completions");
  assert.equal(body.model, BASETEN_HACKATHON_MODEL);
  assert.equal(body.reasoning_effort, "low");
  assert.equal(JSON.stringify(result).includes("private-thoughts"), false);
  assert.equal(result.provider, "baseten");
});

test("disallowed model routes and missing keys fail without another provider", async () => {
  assert.throws(() => new OpenAICompatibleAgentModel({ routes: routingFromEnvironment({ META_MODEL: "gpt-default" }) }), (error: unknown) => error instanceof AgentError && error.code === "CONFIGURATION");
  assert.throws(() => new OpenAICompatibleAgentModel({ routes: routingFromEnvironment({ META_MODEL: "muse-spark-1.3-contributor" }) }), (error: unknown) => error instanceof AgentError && error.code === "CONFIGURATION");
  const model = new OpenAICompatibleAgentModel({ routes: routingFromEnvironment({}) });
  await assert.rejects(model.complete(request()), (error: unknown) => error instanceof AgentError && error.code === "CONFIGURATION");
});

test("provider error bodies never reach application error messages", async () => {
  const transport: typeof fetch = async () => Response.json({ error: { message: "secret-input-content", type: "invalid_request_error" } }, { status: 401 });
  const model = new OpenAICompatibleAgentModel({ metaApiKey: "test-key-not-real", routes: routingFromEnvironment({}), fetch: transport });
  await assert.rejects(model.complete(request()), (error: unknown) => error instanceof AgentError && error.message.includes("401") && !error.message.includes("secret-input-content"));
});
