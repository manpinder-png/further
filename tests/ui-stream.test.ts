import test from "node:test";
import assert from "node:assert/strict";
import { canUseNewRequestKey, consumeEventStream, RequestFailure } from "../lib/client/stream.ts";
import { applyProgress, emptyActivity, type ActivityState, type ProgressEvent } from "../domains/ui/activity.ts";

const at = "2026-11-02T10:00:00.000Z";
const activity = { type: "activity", sequence: 1, at, agentId: "knowledge-map", phase: "thinking", label: "Preparing a useful next step" } as const;
const delta = { type: "text_delta", sequence: 2, at, agentId: "knowledge-map", field: "explanation", delta: "A useful café idea" } as const;
function response(text: string, eachByte = false) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    if (eachByte) for (let i = 0; i < bytes.length; i++) controller.enqueue(bytes.slice(i, i + 1));
    else controller.enqueue(bytes);
    controller.close();
  } }), { headers: { "content-type": "text/event-stream" } });
}

test("SSE survives byte-split UTF-8 and CRLF, ignores heartbeats and returns only the final result", async () => {
  const seen: ProgressEvent[] = [];
  const text = `: heartbeat\r\n\r\nevent: progress\r\ndata: ${JSON.stringify(activity)}\r\n\r\ndata: ${JSON.stringify(delta)}\r\n\r\ndata: {"type":"result",\r\ndata: "result":{"saved":true,"text":"Final café answer"}}\r\n\r\n`;
  const result = await consumeEventStream(response(text, true), (event) => seen.push(event));
  assert.deepEqual(seen, [activity, delta]);
  assert.deepEqual(result, { saved: true, text: "Final café answer" });
});

test("a disconnected stream never turns a provisional draft into a final result", async () => {
  let committed = false;
  const seen: ProgressEvent[] = [];
  await assert.rejects(async () => {
    await consumeEventStream(response(`data: ${JSON.stringify(delta)}\n\n`), (event) => seen.push(event));
    committed = true;
  }, /connection ended before a validated result/);
  assert.equal(committed, false);
  assert.equal(seen.length, 1);
});

test("server error after draft rejects without committing the draft", async () => {
  await assert.rejects(consumeEventStream(response(`data: ${JSON.stringify(delta)}\n\ndata: {"type":"error","error":"The saved map could not be updated"}\n\n`), () => undefined), /saved map could not be updated/);
});

test("abort releases the reader and cannot resolve a successful result", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const res = new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }), { headers: { "content-type": "text/event-stream" } });
  const pending = consumeEventStream(res, () => undefined, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(cancelled, true);
});

test("malformed SSE fails visibly and HTTP failures retain their safe message", async () => {
  await assert.rejects(consumeEventStream(response("data: not json\n\n"), () => undefined), /unreadable update/);
  await assert.rejects(consumeEventStream(new Response(JSON.stringify({ error: "Please open your local profile" }), { status: 401 }), () => undefined), /open your local profile/);
});

test("only explicit confirmed-failure metadata permits a new mutation key", async () => {
  for (const res of [
    response('data: {"type":"error","error":"Failed before saving","code":"AGENT_ATTEMPT_FAILED","retryWithNewKey":true}\n\n'),
    Response.json({ error: "Failed before saving", retryWithNewKey: true }, { status: 409 }),
  ]) await assert.rejects(consumeEventStream(res, () => undefined), error => error instanceof RequestFailure && canUseNewRequestKey(error));
  for (const res of [
    response(`data: ${JSON.stringify(delta)}\n\n`),
    response('data: {"type":"error","error":"Outcome unknown","code":"AGENT_OUTCOME_UNKNOWN"}\n\n'),
    Response.json({ error: "Already running" }, { status: 409 }),
  ]) await assert.rejects(consumeEventStream(res, () => undefined), error => !canUseNewRequestKey(error));
  assert.equal(canUseNewRequestKey(new DOMException("Cancelled", "AbortError")), false);
  assert.equal(canUseNewRequestKey(new TypeError("Network disconnected")), false);
});

test("cumulative transcripts replace drafts and repairs clear only their own agent text", () => {
  let state: ActivityState = { ...emptyActivity(), status: "running" };
  state = applyProgress(state, delta);
  state = applyProgress(state, { type: "text_delta", sequence: 3, at, agentId: "perception", field: "transcript", delta: "How do", replace: true });
  state = applyProgress(state, { type: "text_delta", sequence: 4, at, agentId: "perception", field: "transcript", delta: "How do GPUs work?", replace: true });
  assert.equal(state.drafts["perception:transcript"].text, "How do GPUs work?");
  state = applyProgress(state, { ...activity, sequence: 5 });
  assert.equal(state.drafts["knowledge-map:explanation"], undefined);
  assert.equal(state.drafts["perception:transcript"].text, "How do GPUs work?");
  state = applyProgress(state, { ...delta, sequence: 6, delta: "Repaired answer", replace: true });
  assert.equal(state.drafts["knowledge-map:explanation"].text, "Repaired answer");
});

test("private reasoning fields and late events after completion cannot enter the UI draft", () => {
  const running: ActivityState = { ...emptyActivity(), status: "running" };
  assert.deepEqual(applyProgress(running, { ...delta, field: "reasoning" }).drafts, {});
  const completed: ActivityState = { ...running, status: "completed" };
  assert.equal(applyProgress(completed, delta), completed);
});
