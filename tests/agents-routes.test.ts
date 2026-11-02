import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { POST as teach } from "../app/api/teach/route.ts";
import { POST as course } from "../app/api/course/route.ts";
import { POST as explain } from "../app/api/explain/route.ts";
import { POST as transcribe } from "../app/api/transcribe/route.ts";
import { GET as card } from "../app/api/card/[slug]/route.ts";
import { sessionCookie } from "../domains/backend/identity.ts";
import { createRepository } from "../domains/data/repository.ts";
import type { FurtherRepository } from "../domains/data/contracts.ts";
import { invokeAgent } from "../domains/backend/agents.ts";

let repo: FurtherRepository;
let directory: string;
let cookie: string;
const actorId = randomUUID();
const oldFetch = globalThis.fetch;
const oldEnv = { local: process.env.FURTHER_LOCAL_DIR, mode: process.env.FURTHER_MODEL_MODE, key: process.env.META_API_KEY, model: process.env.META_MODEL, profiles: process.env.FURTHER_ENABLE_LOCAL_PROFILES };
const shared = globalThis as typeof globalThis & { __furtherLocalRepository?: Promise<FurtherRepository> };
let calls = 0;
let response: () => Response = () => { throw new Error("Unexpected external request"); };

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "further-agent-routes-"));
  process.env.FURTHER_LOCAL_DIR = directory;
  process.env.FURTHER_ENABLE_LOCAL_PROFILES = "1";
  process.env.FURTHER_MODEL_MODE = "live";
  process.env.META_API_KEY = "fake-key-never-sent";
  process.env.META_MODEL = "muse-spark-1.3";
  repo = await createRepository();
  shared.__furtherLocalRepository = Promise.resolve(repo);
  await repo.ensureUser(actorId, "Test learner");
  await repo.addConcepts(actorId, [{ slug: "gpu", title: "Graphics processors", hook: "Parallel work", domain: "ai-tech" }]);
  cookie = sessionCookie(actorId).split(";")[0];
  // No test can make a paid network request, including on unexpected paths.
  globalThis.fetch = async (input) => {
    if (String(input) !== "https://api.meta.ai/v1/responses") throw new Error("External network disabled in route tests");
    calls++;
    return response();
  };
});
after(async () => {
  globalThis.fetch = oldFetch;
  for (const [key, value] of [["FURTHER_LOCAL_DIR", oldEnv.local], ["FURTHER_MODEL_MODE", oldEnv.mode], ["META_API_KEY", oldEnv.key], ["META_MODEL", oldEnv.model], ["FURTHER_ENABLE_LOCAL_PROFILES", oldEnv.profiles]]) {
    if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
  }
  delete shared.__furtherLocalRepository;
  await repo.close();
  await rm(directory, { recursive: true, force: true });
});
function request(path: string, payload?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${path}`, { method: payload === undefined ? "GET" : "POST", headers: { cookie, "content-type": "application/json", ...headers }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
}
function modelResponse(data: unknown, grounded = false) {
  return Response.json({ id: "resp_test", object: "response", created_at: 1, status: "completed", model: "muse-spark-1.3", output: [
    ...(grounded ? [{ id: "search_1", type: "web_search_call", status: "completed" }] : []),
    { id: "msg_final", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(data), annotations: grounded ? [{ type: "url_citation", url: "https://example.com/source", title: "Grounded example", start_index: 0, end_index: 5 }] : [] }] },
  ], usage: { input_tokens: 12, output_tokens: 20 } });
}
const grade = (score: number) => ({ mode: "explain-back", title: "Your explanation", body: "You described the mechanism. Add one reason the parallelism matters.", format: "feedback", score });
function wav(channels = 1) {
  const a = new ArrayBuffer(46), d = new DataView(a);
  const ascii = (at: number, s: string) => { for (let i = 0; i < s.length; i++) d.setUint8(at + i, s.charCodeAt(i)); };
  ascii(0, "RIFF"); d.setUint32(4, 38, true); ascii(8, "WAVE"); ascii(12, "fmt "); d.setUint32(16, 16, true);
  d.setUint16(20, 1, true); d.setUint16(22, channels, true); d.setUint32(24, 16000, true); d.setUint32(28, 32000, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true);
  ascii(36, "data"); d.setUint32(40, 2, true);
  return new Blob([a], { type: "audio/wav" });
}

test("lesson, source, grading and voice routes require authenticated local identity", async () => {
  for (const [handler, path] of [[teach, "teach"], [course, "course"], [explain, "explain"], [transcribe, "transcribe"]] as const) {
    const r = await handler(new Request(`http://localhost:3000/api/${path}`, { method: "POST" }));
    assert.equal(r.status, 401);
  }
  assert.equal((await card(new Request("http://localhost:3000/api/card/gpu"), { params: Promise.resolve({ slug: "gpu" }) })).status, 401);
  assert.equal(calls, 0);
});

test("explicit fixture lesson/course/card preserve UI shapes without grading or fictional sources", async () => {
  const headers = { "x-further-demo": "true" };
  const lesson = await (await teach(request("/api/teach", { slug: "gpu" }, headers))).json();
  assert.equal(lesson.demo, true); assert.ok(lesson.body); assert.ok(Array.isArray(lesson.branches));
  const lessons = await (await course(request("/api/course", { slug: "gpu" }, headers))).json();
  assert.equal(lessons.demo, true); assert.equal(lessons.lessons.length, 3);
  const source = await (await card(request("/api/card/gpu", undefined, headers), { params: Promise.resolve({ slug: "gpu" }) })).json();
  assert.equal(source.resource, null); assert.equal(source.grounded, false);
  const feedback = await (await explain(request("/api/explain", { slug: "gpu", transcript: "Example" }, headers))).json();
  assert.equal(feedback.score, null); assert.equal(feedback.persisted, false);
  assert.equal((await repo.getSnapshot(actorId)).events.filter(e => e.kind === "explain").length, 0);
  assert.equal(calls, 0);
});

test("live explain-back retries reuse the run and persist exactly one scoped progress event", async () => {
  calls = 0; response = () => modelResponse(grade(2));
  const headers = { "idempotency-key": "grade-once" };
  const payload = { slug: "gpu", transcript: "It performs many similar operations in parallel." };
  const first = await explain(request("/api/explain", payload, headers));
  assert.equal(first.status, 200); assert.equal(first.headers.get("x-further-persisted"), "true");
  const one = await first.json();
  const two = await (await explain(request("/api/explain", payload, headers))).json();
  assert.equal(one.runId, two.runId); assert.equal(one.persisted, true); assert.equal(one.score, 2); assert.equal(calls, 1);
  const events = (await repo.getSnapshot(actorId)).events.filter(e => e.kind === "explain");
  assert.equal(events.length, 1); assert.equal(events[0].payload?.runId, one.runId);
  const conflict = await explain(request("/api/explain", { ...payload, transcript: "Different answer" }, headers));
  assert.equal(conflict.status, 409); assert.equal(calls, 1);
});

test("invalid grades and unsupported source claims fail without progress or a demo fallback", async () => {
  calls = 0; response = () => modelResponse(grade(4));
  const invalid = await explain(request("/api/explain", { slug: "gpu", transcript: "Example" }, { "idempotency-key": "invalid-grade" }));
  assert.equal(invalid.status, 502); assert.equal(calls, 2);
  assert.equal((await repo.getSnapshot(actorId)).events.filter(e => e.kind === "explain").length, 1);
  response = () => modelResponse({ answer: "Unsupported fact", sources: [{ url: "https://example.com/invented", title: "Invented" }], grounded: true });
  const unavailable = await card(request("/api/card/gpu"), { params: Promise.resolve({ slug: "gpu" }) });
  assert.equal(unavailable.status, 502); assert.equal((await unavailable.json()).demo, undefined);
});

test("source cards retain citation provenance without claiming an HTTP verification", async () => {
  response = () => modelResponse({ answer: "A grounded learning summary.", sources: [], grounded: true }, true);
  const res = await card(request("/api/card/gpu"), { params: Promise.resolve({ slug: "gpu" }) });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.grounded, true); assert.equal(data.resource.url, "https://example.com/source");
  assert.equal(data.resource.verifiedAt, undefined); assert.equal(data.demo, false);
});

test("voice routes reject non-PCM uploads and provide sample text only in explicit fixture mode", async () => {
  const beforeCalls = calls;
  for (const clip of [new Blob(["not wav"], { type: "audio/webm" }), wav(2)]) {
    const form = new FormData(); form.append("audio", clip); form.append("purpose", "curiosity");
    const res = await transcribe(new Request("http://localhost:3000/api/transcribe", { method: "POST", headers: { cookie, "x-further-demo": "true" }, body: form }));
    assert.equal(res.status, 400);
  }
  const form = new FormData(); form.append("audio", wav()); form.append("purpose", "explain");
  const res = await transcribe(new Request("http://localhost:3000/api/transcribe", { method: "POST", headers: { cookie, "x-further-demo": "true" }, body: form }));
  assert.equal(res.status, 200); assert.equal((await res.json()).demo, true); assert.equal(calls, beforeCalls);
});

test("planning and peer advice save their run without changing the learner map, intent or metadata",async()=>{
  const before=await repo.getSnapshot(actorId);
  const previous=process.env.FURTHER_MODEL_MODE;
  process.env.FURTHER_MODEL_MODE="fixture";
  try {
    for(const objective of ["plan","recommend"] as const){
      const result=await invokeAgent(actorId,"knowledge-map",{text:`Read-only ${objective} for my next step`,objective},{idempotencyKey:`read-only-${objective}`});
      assert.equal(result.persisted,true);assert.deepEqual(result.data.concepts,[]);
      const saved=await repo.getAgentRun(actorId,result.runId);
      assert.equal(saved?.status,"succeeded");assert.equal(saved?.input.objective,objective);
    }
  }finally{process.env.FURTHER_MODEL_MODE=previous;}
  const after=await repo.getSnapshot(actorId);
  assert.deepEqual(after.concepts,before.concepts);
  assert.deepEqual(after.events,before.events);
  assert.deepEqual(after.metadata,before.metadata);
  assert.equal(after.profile.currentIntent,before.profile.currentIntent);
});

test("saved lessons restore without inference across fresh requests; generation stays explicit and owner/depth/mode scoped", async () => {
  const lesson = { mode: "solo", title: "Parallel work", body: "Independent pieces can be computed at the same time. Compare two workers with one, then consider coordination costs.", format: "short-read", branches: [], adaptedNote: "A concrete comparison." };
  const startCalls = calls;
  response = () => modelResponse(lesson);
  const firstResponse = await teach(request("/api/teach", { slug: "gpu", depth: 1 }));
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.equal(first.restored, false); assert.equal(calls, startCalls + 1);
  const restored = await (await teach(request("/api/teach", { slug: "gpu", depth: 1 }))).json();
  assert.equal(restored.restored, true); assert.equal(restored.runId, first.runId); assert.equal(calls, startCalls + 1);

  const deeper = await (await teach(request("/api/teach", { slug: "gpu", depth: 2 }))).json();
  assert.equal(deeper.restored, false); assert.notEqual(deeper.runId, first.runId); assert.equal(calls, startCalls + 2);
  response = () => modelResponse({ ...lesson, title: "A different example" });
  const regenerated = await (await teach(request("/api/teach", { slug: "gpu", depth: 1, regenerate: true }, { "idempotency-key": "explicit-different-example" }))).json();
  assert.equal(regenerated.restored, false); assert.equal(regenerated.title, "A different example"); assert.equal(calls, startCalls + 3);
  const latest = await (await teach(request("/api/teach", { slug: "gpu", depth: 1 }))).json();
  assert.equal(latest.restored, true); assert.equal(latest.runId, regenerated.runId); assert.equal(calls, startCalls + 3);

  const oldMode = process.env.FURTHER_MODEL_MODE;
  process.env.FURTHER_MODEL_MODE = "fixture";
  try {
    const fixture = await (await teach(request("/api/teach", { slug: "gpu", depth: 1 }))).json();
    assert.equal(fixture.demo, true); assert.equal(fixture.restored, false); assert.notEqual(fixture.runId, regenerated.runId);
  } finally { process.env.FURTHER_MODEL_MODE = oldMode; }
  const liveAgain = await (await teach(request("/api/teach", { slug: "gpu", depth: 1 }))).json();
  assert.equal(liveAgain.demo, false); assert.equal(liveAgain.runId, regenerated.runId); assert.equal(calls, startCalls + 3);

  const other = randomUUID(); await repo.ensureUser(other, "Another learner");
  await repo.addConcepts(other, [{ slug: "gpu", title: "Graphics processors", hook: "Parallel work", domain: "ai-tech" }]);
  const otherCookie = sessionCookie(other).split(";")[0];
  const separate = await (await teach(request("/api/teach", { slug: "gpu", depth: 1 }, { cookie: otherCookie }))).json();
  assert.equal(separate.restored, false); assert.notEqual(separate.runId, regenerated.runId); assert.equal(calls, startCalls + 4);
  const missing = await teach(request("/api/teach", { slug: "not-on-my-path" }));
  assert.equal(missing.status, 404); assert.equal(calls, startCalls + 4);
});
