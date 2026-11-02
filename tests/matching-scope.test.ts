import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepository } from "../domains/data/repository.ts";
import type { FurtherRepository } from "../domains/data/contracts.ts";
import { rankedPeers, suggestMatch } from "../domains/backend/social.ts";
import { POST as match } from "../app/api/match/route.ts";
import { sessionCookie } from "../domains/backend/identity.ts";
import { seedSemanticIndex } from "./helpers/semantic-vectors.ts";

const chatbot = { slug: "chatbot-memory", title: "Chatbot memory", hook: "Context and recall", domain: "computing" };
const bread = { slug: "bread-fermentation", title: "Bread fermentation", hook: "How dough rises", domain: "cooking" };
const foreign = { slug: "private-other-topic", title: "Another learner's topic", hook: "Not in this learner's map", domain: "general" };
const shared = globalThis as typeof globalThis & { __furtherLocalRepository?: Promise<FurtherRepository> };
let repo: FurtherRepository, actor: string, breadPeer: string, chatPeer: string, directory: string;
const oldEnv = { profiles: process.env.FURTHER_ENABLE_LOCAL_PROFILES, local: process.env.FURTHER_LOCAL_DIR };

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "further-match-scope-"));
  process.env.FURTHER_ENABLE_LOCAL_PROFILES = "1";
  process.env.FURTHER_LOCAL_DIR = directory;
});
after(async () => {
  if (oldEnv.profiles === undefined) delete process.env.FURTHER_ENABLE_LOCAL_PROFILES; else process.env.FURTHER_ENABLE_LOCAL_PROFILES = oldEnv.profiles;
  if (oldEnv.local === undefined) delete process.env.FURTHER_LOCAL_DIR; else process.env.FURTHER_LOCAL_DIR = oldEnv.local;
  await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  repo = await createRepository(); shared.__furtherLocalRepository = Promise.resolve(repo);
  actor = randomUUID(); breadPeer = randomUUID(); chatPeer = randomUUID();
  for (const [id, name] of [[actor, "Learner"], [breadPeer, "Bread peer"], [chatPeer, "Chatbot peer"]]) {
    await repo.ensureUser(id, name);
    await repo.updateProfile(id, { staticProfile: { age18Plus: true }, openToMatch: true, availableMinutes: 15 });
    await repo.heartbeat(id);
  }
  await repo.addConcepts(actor, [chatbot, bread]);
  await repo.addConcepts(breadPeer, [bread]);
  await repo.addConcepts(chatPeer, [bread, chatbot, foreign]);
  // Bread is now the learner's recent interest and strongest saved explanation.
  // Explicitly returning to the older chatbot question must override that focus.
  await repo.recordEvent(actor, { slug: chatbot.slug, kind: "skip", idempotencyKey: "old-topic-1" });
  await repo.recordEvent(actor, { slug: chatbot.slug, kind: "skip", idempotencyKey: "old-topic-2" });
  await repo.recordEvent(actor, { slug: bread.slug, kind: "explain", payload: { score: 3 }, idempotencyKey: "bread-explanation" });
  await repo.recordEvent(chatPeer, { slug: bread.slug, kind: "explain", payload: { score: 3 }, idempotencyKey: "peer-bread" });
  await repo.recordEvent(chatPeer, { slug: chatbot.slug, kind: "explain", payload: { score: 3 }, idempotencyKey: "peer-chat" });
  for (const id of [actor, breadPeer, chatPeer]) await seedSemanticIndex(repo, id);
});
afterEach(async () => { delete shared.__furtherLocalRepository; await repo.close(); });

function request(payload: unknown) {
  return new Request("http://localhost:3000/api/match", { method: "POST", headers: { cookie: sessionCookie(actor).split(";")[0], "content-type": "application/json" }, body: JSON.stringify(payload) });
}

test("returning to an older path scopes ranking and every invitation starting topic", async () => {
  const unscoped = await rankedPeers(repo, actor);
  assert.ok([breadPeer, chatPeer].includes(unscoped[0].peer.id));
  assert.ok(unscoped[0].score >= .6);
  const scoped = await rankedPeers(repo, actor, [chatbot.slug]);
  assert.deepEqual(scoped.map(row => row.peer.id), [chatPeer]);
  assert.deepEqual(scoped[0].peer.activeConcepts, [chatbot.slug]);
  assert.deepEqual(Object.keys(scoped[0].peer.mastery), [chatbot.slug]);
  assert.equal(scoped[0].teach?.slug, chatbot.slug);
  const result = await suggestMatch(repo, actor, [chatbot.slug]);
  assert.equal(result.match?.peer.id, chatPeer);
  assert.equal(result.match?.concept, chatbot.slug);
  assert.equal(result.match?.youStrong, chatbot.slug);
  assert.equal(result.match?.peerStrong, chatbot.slug);
  const invitation = (await repo.getInvitations(actor))[0];
  assert.equal(invitation.context.fromStrong, chatbot.slug);
  assert.equal(invitation.context.toStrong, chatbot.slug);
  assert.equal(invitation.context.shared, chatbot.slug);
  assert.equal(invitation.context.semanticMatchingVersion, "semantic-cosine-v1");
});

test("switching question preserves an existing invitation and its agreed room topic", async () => {
  const first = await suggestMatch(repo, actor);
  assert.ok(first.match && [breadPeer, chatPeer].includes(first.match.peer.id));
  assert.equal(first.match?.concept, bread.slug);
  const scoped = await suggestMatch(repo, actor, [chatbot.slug]);
  assert.equal(scoped.match?.id, first.match?.id);
  assert.equal(scoped.match?.concept, bread.slug);
  assert.equal((await repo.getInvitations(actor)).length, 1);
  await repo.respondToInvite(actor, first.match!.id, "accept");
  const accepted = await repo.respondToInvite(first.match!.peer.id, first.match!.id, "accept");
  assert.equal((await repo.getSession(actor, accepted.sessionId!)).conceptSlug, bread.slug);
});

test("match API rejects foreign, unknown or malformed scope and ignores client profile and scores", async () => {
  for (const conceptSlugs of [[foreign.slug], ["unknown-topic"], [chatbot.slug, foreign.slug], [], [12], ["Bad slug"], Array(101).fill(chatbot.slug)]) {
    const response = await match(request({ conceptSlugs }));
    assert.equal(response.status, 400, JSON.stringify(conceptSlugs));
  }
  assert.equal((await repo.getInvitations(actor)).length, 0);
  const forged = { conceptSlugs: [chatbot.slug], me: { id: chatPeer, activeConcepts: [bread.slug], mastery: { [bread.slug]: 1 }, language: "fr", openToMatch: true }, edges: [{ src: bread.slug, dst: chatbot.slug, kind: "related" }] };
  await repo.updateProfile(actor, { openToMatch: false });
  const closed = await match(request(forged));
  assert.equal(closed.status, 200); assert.equal((await closed.json()).match, null);
  await repo.updateProfile(actor, { openToMatch: true });
  const response = await match(request(forged));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.match.peer.id, chatPeer);
  assert.equal(result.match.concept, chatbot.slug);
  assert.equal(result.match.youStrong, chatbot.slug);
});
