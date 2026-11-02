import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRepository } from "../domains/data/repository.ts";
import type { FurtherRepository } from "../domains/data/contracts.ts";
import { invokeAgent } from "../domains/backend/agents.ts";
import { HttpError } from "../domains/backend/http.ts";
import { withProgress } from "../domains/backend/streaming.ts";
import { canUseNewRequestKey, consumeEventStream } from "../lib/client/stream.ts";

let repo: FurtherRepository;
const actor = randomUUID(), shared = globalThis as typeof globalThis & { __furtherLocalRepository?: Promise<FurtherRepository> };
const originalMode = process.env.FURTHER_MODEL_MODE, originalFetch = globalThis.fetch;
before(async () => {
  repo = await createRepository(); shared.__furtherLocalRepository = Promise.resolve(repo);
  await repo.ensureUser(actor, "Retry verification"); process.env.FURTHER_MODEL_MODE = "fixture";
  globalThis.fetch = async () => { throw new Error("No external network in retry tests"); };
});
after(async () => {
  delete shared.__furtherLocalRepository; await repo.close(); globalThis.fetch = originalFetch;
  if (originalMode === undefined) delete process.env.FURTHER_MODEL_MODE; else process.env.FURTHER_MODEL_MODE = originalMode;
});

test("a durable pre-save failure permits a fresh attempt, while a lost success restores once", async () => {
  const input = { text: "Explore parallel work", objective: "expand" as const }, before = await repo.getSnapshot(actor);
  const getSnapshot = repo.getSnapshot;
  repo.getSnapshot = async () => { throw new Error("Synthetic temporary read failure"); };
  let firstError: unknown;
  try { await invokeAgent(actor, "knowledge-map", input, { idempotencyKey: "first-failed" }); } catch (error) { firstError = error; }
  finally { repo.getSnapshot = getSnapshot; }
  assert.ok(firstError instanceof HttpError); assert.equal(firstError.details?.retryWithNewKey, true);
  const afterFailure = await repo.getSnapshot(actor);
  assert.deepEqual(afterFailure.concepts, before.concepts); assert.deepEqual(afterFailure.metadata, before.metadata);
  const record = (await repo.getAgentRuns(actor)).find(run => run.input.text === input.text)!;
  assert.equal(record.status, "failed"); assert.equal(record.output?.retryWithNewKey, true);
  // Unknown disconnects first probe their original key. This response confirms
  // no graph mutation happened and authorizes one fresh attempt.
  const streamed = await withProgress(new Request("http://localhost:3000/retry", { headers: { accept: "text/event-stream" } }), "knowledge-map", progress => invokeAgent(actor, "knowledge-map", input, { idempotencyKey: "first-failed", onEvent: progress.onEvent }));
  await assert.rejects(consumeEventStream(streamed, () => undefined), error => canUseNewRequestKey(error));
  const succeeded = await invokeAgent(actor, "knowledge-map", input, { idempotencyKey: "fresh-confirmed-retry" });
  assert.equal(succeeded.persisted, true);
  const saved = await repo.getSnapshot(actor);
  const restored = await invokeAgent(actor, "knowledge-map", input, { idempotencyKey: "fresh-confirmed-retry" });
  assert.equal(restored.runId, succeeded.runId);
  const again = await repo.getSnapshot(actor);
  assert.deepEqual(again.events, saved.events); assert.deepEqual(again.metadata, saved.metadata);
});

test("partial-save failures never authorize a fresh key or duplicate a mutation on replay", async () => {
  const input = { text: "Explore partial-write recovery", objective: "expand" as const }, updateProfile = repo.updateProfile;
  // Map concepts/metadata are saved before this profile update: the outcome is
  // deliberately not safe to rerun as an unrelated mutation.
  repo.updateProfile = async () => { throw new Error("Synthetic persistence interruption"); };
  try { await assert.rejects(invokeAgent(actor, "knowledge-map", input, { idempotencyKey: "partial-save" })); }
  finally { repo.updateProfile = updateProfile; }
  const saved = await repo.getSnapshot(actor), run = (await repo.getAgentRuns(actor)).find(item => item.input.text === input.text)!;
  assert.equal(run.status, "failed"); assert.equal(run.output?.retryWithNewKey, false);
  await assert.rejects(invokeAgent(actor, "knowledge-map", input, { idempotencyKey: "partial-save" }), error => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409); assert.equal(error.details?.code, "AGENT_OUTCOME_UNKNOWN"); assert.equal(error.details?.retryWithNewKey, undefined);
    return true;
  });
  const again = await repo.getSnapshot(actor);
  assert.deepEqual(again.events, saved.events); assert.deepEqual(again.metadata, saved.metadata);
});

test("live lesson context excludes fixture lessons and restores only live prior lessons", async () => {
  const concept = "mode-isolation", savedFetch = globalThis.fetch;
  const savedEnv = { FURTHER_MODEL_MODE: process.env.FURTHER_MODEL_MODE, META_API_KEY: process.env.META_API_KEY, META_MODEL: process.env.META_MODEL };
  for (const mode of ["fixture", "live"] as const) {
    const id = randomUUID();
    await repo.beginAgentRun({ id, actorId: actor, agentId: "learning-companion", input: { mode: "solo", concept } });
    await repo.finishAgentRun(actor, id, { output: { mode, data: { title: `${mode} lesson`, body: `unique_${mode}_prior_lesson` } } });
  }
  let sentBody = "", calls = 0;
  process.env.FURTHER_MODEL_MODE = "live"; process.env.META_API_KEY = "fake-key-never-sent"; process.env.META_MODEL = "muse-spark-1.3";
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.url !== "https://api.meta.ai/v1/responses") throw new Error("External network disabled in lesson context test");
    sentBody = await request.text(); calls++;
    return Response.json({ id: "resp_mode_test", object: "response", created_at: 1, status: "completed", model: "muse-spark-1.3", output: [
      { id: "msg_final", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ mode: "solo", title: "Current lesson", body: "Use only the previous live lesson as context.", format: "short-read" }), annotations: [] }] },
    ], usage: { input_tokens: 12, output_tokens: 20 } });
  };
  try {
    const result = await invokeAgent(actor, "learning-companion", { mode: "solo", concept }, { idempotencyKey: "mode-isolation" });
    assert.equal(result.persisted, true); assert.equal(calls, 1);
    assert.ok(sentBody.includes("unique_live_prior_lesson")); assert.ok(!sentBody.includes("unique_fixture_prior_lesson"));
  } finally {
    globalThis.fetch = savedFetch;
    for (const [name, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
