/** Real HTTP against an isolated fixture-mode server only; never a live user database. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { KnowledgeOverviewResult, KnowledgeOverviewSnapshot } from "../lib/knowledge-overview.ts";

const base = process.env.FURTHER_TEST_URL?.replace(/\/$/, "");
if (base && !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(base)) throw new Error("FURTHER_TEST_URL must be a local HTTP origin with an explicit port");
class Client {
  cookie = "";
  learnerId = "";
  async request(path: string, method = "GET", data?: unknown, extra: Record<string, string> = {}) {
    const response = await fetch(base! + path, {
      method, headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(data === undefined ? {} : { "content-type": "application/json" }), ...extra },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(60_000),
    });
    const cookie = response.headers.getSetCookie().find(value => value.startsWith("further_account_session="));
    if (cookie) this.cookie = cookie.split(";")[0];
    return response;
  }
  async json<T>(path: string, method = "GET", data?: unknown): Promise<T> {
    const response = await this.request(path, method, data), text = await response.text();
    assert.equal(response.status, 200, `${method} ${path}: ${text.slice(0, 300)}`);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    return JSON.parse(text) as T;
  }
}

test("HTTP knowledge overview: real account isolation, streamed fixture grouping and cache reuse", { skip: !base, timeout: 180_000 }, async t => {
  const health = await (await fetch(base! + "/api/health")).json() as { modelMode?: string };
  assert.equal(health.modelMode, "fixture", "Use an isolated fixture-mode server for this test");
  const alice = new Client(), bob = new Client(), anonymous = new Client();
  const tag = randomUUID().replaceAll("-", "").slice(0, 10);
  let initial!: KnowledgeOverviewSnapshot, generated!: KnowledgeOverviewResult;
  const gpu = `gpu-${tag}`, chips = `chips-${tag}`;
  let failed = false;
  async function step(name: string, action: () => Promise<void>) {
    await t.test(name, { skip: failed ? "An earlier journey step failed" : false }, async () => {
      try { await action(); } catch (error) { failed = true; throw error; }
    });
  }
  async function staleActorRejected(sourceHash: string) {
    assert.ok(bob.learnerId); assert.notEqual(alice.learnerId, bob.learnerId);
    const headers = { "x-further-actor": bob.learnerId, accept: "text/event-stream" };
    for (const response of [
      await alice.request("/api/knowledge/overview", "GET", undefined, headers),
      await alice.request("/api/knowledge/overview", "POST", { sourceHash }, headers),
    ]) {
      assert.equal(response.status, 409, "an Alice session cannot satisfy a request captured for Bob");
      assert.match(response.headers.get("content-type") ?? "", /application\/json/, "reject stale identity before opening a stream or restoring a result");
      const body = await response.json() as Record<string, unknown>;
      assert.equal(body.overview, undefined); assert.equal(body.runId, undefined);
    }
  }

  await step("authentication and independent empty maps", async () => {
    assert.equal((await anonymous.request("/api/knowledge/overview")).status, 401);
    for (const [client, suffix] of [[alice, "a"], [bob, "b"]] as const) {
      const signup = await client.json<{ account: { learnerId: string } }>("/api/auth/signup", "POST", { email: `overview_${tag}_${suffix}@example.test`, username: `overview_${tag}_${suffix}`, displayName: `Overview ${suffix}`, password: "Synthetic overview test password 42!" });
      client.learnerId = signup.account.learnerId;
      assert.ok(client.cookie);
      assert.equal((await client.json<KnowledgeOverviewSnapshot>("/api/knowledge/overview")).status, "empty");
    }
    await staleActorRejected((await alice.json<KnowledgeOverviewSnapshot>("/api/knowledge/overview")).sourceHash);
  });
  await step("save canonical concepts and keep another account empty", async () => {
    await alice.json("/api/data/concepts", "POST", { concept: { slug: chips, title: "AI hardware", hook: "Chips used for learning systems", domain: "ai-tech" } });
    await alice.json("/api/data/concepts", "POST", { concept: { slug: gpu, title: "Graphics processors", hook: "Many operations at once", domain: "ai-tech" }, edge: { from: chips, kind: "part_of" } });
    initial = await alice.json<KnowledgeOverviewSnapshot>("/api/knowledge/overview");
    assert.equal(initial.status, "missing");
    assert.equal((await bob.json<KnowledgeOverviewSnapshot>("/api/knowledge/overview")).status, "empty");
    assert.equal((await alice.request("/api/knowledge/overview", "POST", { sourceHash: initial.sourceHash, actorId: "forged" })).status, 400);
  });
  await step("SSE delivers an explicitly labelled fixture result covering each canonical topic once", async () => {
    const response = await alice.request("/api/knowledge/overview", "POST", { sourceHash: initial.sourceHash }, { accept: "text/event-stream" });
    assert.equal(response.status, 200); assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
    const events = (await response.text()).split(/\r?\n\r?\n/).flatMap(block => block.startsWith("data: ") ? [JSON.parse(block.slice(6)) as Record<string, unknown>] : []);
    assert.equal(events[0]?.type, "activity"); assert.equal(events.at(-1)?.type, "result");
    generated = events.at(-1)?.result as KnowledgeOverviewResult;
    assert.equal(generated.mode, "fixture"); assert.equal(generated.sourceHash, initial.sourceHash);
    assert.deepEqual(generated.overview.groups.flatMap(group => group.conceptSlugs).sort(), [gpu, chips].sort());
    assert.equal(events.some(event => event.type === "text_delta" && event.delta), false);
  });
  await step("reload and learning activity reuse the summary without publishing to another account", async () => {
    await staleActorRejected(initial.sourceHash);
    const reload = new Client(); reload.cookie = alice.cookie;
    const cached = await reload.json<KnowledgeOverviewSnapshot>("/api/knowledge/overview");
    assert.equal(cached.status, "ready"); assert.equal(cached.runId, generated.runId);
    await alice.json("/api/data/events", "POST", { slug: gpu, kind: "open", idempotencyKey: `overview-open-${tag}` });
    const again = await alice.json<KnowledgeOverviewResult>("/api/knowledge/overview", "POST", { sourceHash: initial.sourceHash });
    assert.equal(again.runId, generated.runId);
    assert.equal((await bob.json<KnowledgeOverviewSnapshot>("/api/knowledge/overview")).status, "empty");
  });
  await step("new topics invalidate the source and stale generation cannot overwrite the map", async () => {
    await alice.json("/api/data/concepts", "POST", { concept: { slug: `bread-${tag}`, title: "Bread fermentation", hook: "Yeast changes dough", domain: "ai-tech" } });
    const changed = await alice.json<KnowledgeOverviewSnapshot>("/api/knowledge/overview");
    assert.equal(changed.status, "missing"); assert.notEqual(changed.sourceHash, initial.sourceHash);
    assert.equal((await alice.request("/api/knowledge/overview", "POST", { sourceHash: initial.sourceHash })).status, 409);
    const next = await alice.json<KnowledgeOverviewResult>("/api/knowledge/overview", "POST", { sourceHash: changed.sourceHash });
    assert.notEqual(next.runId, generated.runId); assert.equal(next.overview.groups.flatMap(group => group.conceptSlugs).length, 3);
  });
});
