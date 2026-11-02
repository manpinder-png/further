/** Isolated fixture server only. These synthetic learners never enter the user's DB. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { GeomindResponse, GeomindInviteResponse } from "../lib/geomind.ts";

const base = process.env.FURTHER_TEST_URL?.replace(/\/$/, "");
if (base && !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(base)) throw new Error("Geomind HTTP tests need an isolated local server");
class Client {
  cookie = "";
  async request<T = Record<string, unknown>>(path: string, method = "GET", input?: unknown, extra: Record<string,string> = {}) {
    const response = await fetch(base! + path, { method, headers: { cookie: this.cookie, "content-type": "application/json", ...extra }, body: input === undefined ? undefined : JSON.stringify(input), signal: AbortSignal.timeout(30_000) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return { status: response.status, body: await response.json() as T, headers: response.headers };
  }
  async ok<T = Record<string, unknown>>(path: string, method = "GET", input?: unknown) {
    const result = await this.request<T>(path, method, input);
    assert.equal(result.status, 200, `${method} ${path}: ${JSON.stringify(result.body)}`);
    assert.match(result.headers.get("cache-control") ?? "", /no-store/);
    return result.body;
  }
}

test("Geomind HTTP: consented neighborhood and a named invitation keep identity and room boundaries", { skip: !base, timeout: 120_000 }, async t => {
  const health = await (await fetch(base! + "/api/health")).json();
  assert.equal(health.modelMode, "fixture", "Use an isolated fixture database");
  const alice = new Client(), bob = new Client(), other = new Client(), anon = new Client();
  const tag = randomUUID().slice(0, 8), shared = `geomind-http-${tag}`, privateSlug = `geomind-private-${tag}`;
  const ai = await alice.ok<{actorId:string}>("/api/local/identity", "POST", { displayName: `Geomind test Alice ${tag}` });
  const bi = await bob.ok<{actorId:string}>("/api/local/identity", "POST", { displayName: `Geomind test Bob ${tag}` });
  const oi = await other.ok<{actorId:string}>("/api/local/identity", "POST", { displayName: `Geomind test Other ${tag}` });
  for (const client of [alice, bob, other]) {
    await client.ok("/api/data/profile", "PATCH", { openToMatch: true, availableMinutes: 20, staticProfile: { age18Plus: true, role: "learner", background: "PRIVATE BACKGROUND MARKER" }, currentIntent: "PRIVATE INTENT MARKER" });
    await client.ok("/api/data/concepts", "POST", { concept: { slug: shared, title: `Shared conceptual topic ${tag}`, hook: "A synthetic HTTP-test topic", domain: "ai-tech" } });
    await client.ok("/api/local/presence", "POST");
  }
  await bob.ok("/api/data/concepts", "POST", { concept: { slug: privateSlug, title: `Private topic ${tag}`, hook: "Not shared with Alice", domain: "ai-tech" } });
  // Older private learning is not part of the consented active-topic projection,
  // even when it has an embedding in the same space.
  for (let i = 0; i < 4; i++) await bob.ok("/api/data/events", "POST", { slug: privateSlug, kind: "skip", idempotencyKey: `private-inactive-${tag}-${i}` });
  // This route test exercises real local indexing, not synthetic vectors injected
  // into an application endpoint. The fixture server needs the local encoder.
  for (const client of [alice, bob, other]) await client.ok("/api/local/reindex", "POST", {});
  const indexDeadline = Date.now() + 60_000;
  for (const client of [alice, bob, other]) {
    for (;;) {
      const { indexing } = await client.ok<{indexing:{pending:number;processing:number;retry:number}}>("/api/local/indexing");
      if (indexing.pending + indexing.processing + indexing.retry === 0) break;
      assert.ok(Date.now() < indexDeadline, "Start the local embedding service before Geomind HTTP tests");
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    await client.ok("/api/local/presence", "POST");
  }

  await t.test("authorized response has shared topics but no private history; invalid scope and cross-site calls fail", async () => {
    assert.equal((await anon.request("/api/geomind", "POST", {})).status, 401);
    assert.equal((await alice.request("/api/geomind", "POST", {}, { origin: "https://unrelated.example" })).status, 403);
    assert.equal((await alice.request("/api/geomind", "POST", {}, { "x-further-actor": bi.actorId })).status, 409);
    assert.equal((await alice.request("/api/geomind", "POST", { conceptSlugs: [privateSlug] })).status, 400);
    assert.equal((await alice.request("/api/geomind", "POST", { actorId: bi.actorId })).status, 400);
    const result = await alice.ok<GeomindResponse>("/api/geomind", "POST", { conceptSlugs: [shared] });
    assert.equal(result.mode, "available-now");
    assert.ok(result.neighbors.some(peer => peer.id === bi.actorId));
    const bobView = result.neighbors.find(peer => peer.id === bi.actorId)!;
    assert.deepEqual(bobView.sharedTopics.map(topic => topic.slug), [shared]);
    assert.equal(bobView.commonMinutes, 20);
    const serialized = JSON.stringify(result);
    for (const secret of ["PRIVATE BACKGROUND MARKER", "PRIVATE INTENT MARKER", privateSlug, "mastery", "metadata", "staticProfile"]) assert.equal(serialized.includes(secret), false, secret);
  });

  await t.test("opt-out removes the peer and an old selection cannot send an invitation", async () => {
    await bob.ok("/api/data/profile", "PATCH", { openToMatch: false });
    const result = await alice.ok<GeomindResponse>("/api/geomind", "POST", { conceptSlugs: [shared] });
    assert.equal(result.neighbors.some(peer => peer.id === bi.actorId), false);
    assert.equal((await alice.request("/api/geomind/invite", "POST", { peerId: bi.actorId, conceptSlug: shared })).status, 409);
    await alice.ok("/api/data/profile", "PATCH", { openToMatch: false });
    assert.equal((await alice.ok<GeomindResponse>("/api/geomind", "POST", {})).emptyReason, "discovery-off");
    for (const client of [alice, bob]) { await client.ok("/api/data/profile", "PATCH", { openToMatch: true }); await client.ok("/api/local/presence", "POST"); }
  });

  await t.test("the named person and concept are preserved, retries reuse one invitation, and both must accept", async () => {
    const input = { peerId: bi.actorId, conceptSlug: shared };
    const invitation = await alice.ok<GeomindInviteResponse>("/api/geomind/invite", "POST", input);
    assert.equal(invitation.match.peer.id, bi.actorId);
    assert.equal(invitation.match.concept, shared);
    assert.equal(invitation.match.status, "pending");
    assert.equal((await alice.ok<GeomindInviteResponse>("/api/geomind/invite", "POST", input)).match.id, invitation.match.id);
    assert.equal((await alice.request("/api/geomind/invite", "POST", { peerId: oi.actorId, conceptSlug: shared })).status, 409);
    assert.equal((await other.request(`/api/match?requestId=${invitation.match.id}`)).status, 404);
    const first = await alice.ok<{status:string;sessionId?:string}>("/api/match", "POST", { requestId: invitation.match.id, decision: "accept" });
    assert.equal(first.status, "waiting"); assert.equal(first.sessionId, undefined);
    const second = await bob.ok<{status:string;sessionId:string}>("/api/match", "POST", { requestId: invitation.match.id, decision: "accept" });
    assert.equal(second.status, "accepted"); assert.ok(second.sessionId);
    const others = await other.ok<GeomindResponse>("/api/geomind", "POST", { conceptSlugs: [shared] });
    assert.equal(others.neighbors.some(peer => peer.id === ai.actorId || peer.id === bi.actorId), false);
    assert.equal((await other.request(`/api/local/sessions/${second.sessionId}`)).status, 404);
    await alice.ok(`/api/session/${second.sessionId}/end`, "POST", {});
  });
  for (const client of [alice, bob, other]) await client.ok("/api/data/profile", "PATCH", { openToMatch: false });
});
