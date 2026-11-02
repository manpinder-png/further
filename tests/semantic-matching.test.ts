import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRepository } from "../domains/data/repository.ts";
import type { FurtherRepository } from "../domains/data/contracts.ts";
import { geomindNeighborhood, inviteGeomindNeighbor } from "../domains/backend/geomind.ts";
import { rankedPeers, suggestMatch } from "../domains/backend/social.ts";
import { scoreSemanticFit, SEMANTIC_MIN_SIMILARITY, semanticOperatingPoint } from "../lib/matching.ts";
import { seedSemanticIndex, unitVector } from "./helpers/semantic-vectors.ts";

let repo: FurtherRepository, actor: string, peer: string, unrelated: string;
const own = { slug: "gpu-execution", title: "How GPUs execute instructions", hook: "Many operations at once", domain: "computing" };
const related = { slug: "parallel-computing", title: "Parallel computing", hook: "Work distributed across many processors", domain: "computing" };
const bread = { slug: "dough-fermentation", title: "Bread fermentation", hook: "Yeast and dough", domain: "cooking" };

beforeEach(async () => {
  repo = await createRepository(); actor = randomUUID(); peer = randomUUID(); unrelated = randomUUID();
  for (const [id, name] of [[actor, "GPU learner"], [peer, "Parallel learner"], [unrelated, "Bread learner"]]) {
    await repo.ensureUser(id, name);
    await repo.updateProfile(id, { openToMatch: true, staticProfile: { role: "learner", background: "PRIVATE_BACKGROUND", age18Plus: true }, availableMinutes: 20, currentIntent: "PRIVATE_INTENT" });
    await repo.heartbeat(id);
  }
  await repo.addConcepts(actor, [own]); await repo.addConcepts(peer, [related]); await repo.addConcepts(unrelated, [bread]);
});
afterEach(async () => { await repo.close(); });

async function index() {
  await seedSemanticIndex(repo, actor, { [own.slug]: unitVector(0) });
  await seedSemanticIndex(repo, peer, { [related.slug]: unitVector(0, .1) });
  await seedSemanticIndex(repo, unrelated, { [bread.slug]: unitVector(3) });
}

test("different canonical concepts are discovered through actual pgvector cosine, with one engine for guides and Geomind", async () => {
  await index();
  const map = await geomindNeighborhood(repo, actor);
  const guide = await rankedPeers(repo, actor);
  assert.deepEqual(map.neighbors.map(row => row.id), [peer]);
  assert.deepEqual(guide.map(row => row.peer.id), [peer]);
  const neighbor = map.neighbors[0];
  assert.equal(neighbor.proximity.method, "semantic-cosine-v1");
  assert.ok(neighbor.proximity.similarity! > SEMANTIC_MIN_SIMILARITY);
  assert.deepEqual(neighbor.topicPairs?.[0].ownTopic, { slug: own.slug, title: own.title });
  assert.deepEqual(neighbor.topicPairs?.[0].peerTopic, { slug: related.slug, title: related.title });
  assert.ok(neighbor.reasons.some(reason => reason.kind === "related-topic"));
  assert.equal(JSON.stringify(map).includes("PRIVATE_"), false);
  assert.equal(JSON.stringify(map).includes(bread.slug), false);
  assert.deepEqual(await repo.getInvitations(actor), []);
});

test("semantic proximity stays fixed when practical availability changes recommendation fit", async () => {
  await index();
  const before = (await geomindNeighborhood(repo, actor)).neighbors[0];
  await repo.updateProfile(peer, { availableMinutes: 40 });
  const after = (await geomindNeighborhood(repo, actor)).neighbors[0];
  assert.equal(after.proximity.similarity, before.proximity.similarity);
  assert.ok(after.recommendationScore! < before.recommendationScore!);
});

test("weak absolute-floor pairs are neither advertised nor invitable when a stronger connection exists", async () => {
  await repo.addConcepts(actor, [bread]);
  const weak = Array<number>(768).fill(0); weak[0] = .6; weak[1] = .8;
  await seedSemanticIndex(repo, actor, { [own.slug]: unitVector(0), [bread.slug]: weak });
  await seedSemanticIndex(repo, peer, { [related.slug]: unitVector(0, .1) });
  await seedSemanticIndex(repo, unrelated, { [bread.slug]: unitVector(3) });
  const result = await geomindNeighborhood(repo, actor);
  const neighbor = result.neighbors.find(row => row.id === peer)!;
  assert.deepEqual(neighbor.topicPairs?.map(pair => pair.ownTopic.slug), [own.slug]);
  assert.ok(neighbor.topicPairs!.length <= 3);
  // Narrowing the invitation to the rejected idea must not promote that pair.
  await assert.rejects(inviteGeomindNeighbor(repo, actor, peer, bread.slug, related.slug), /no longer available/);
  assert.deepEqual(await repo.getInvitations(actor), []);
});

test("an unrelated learner's pending index does not block an already indexed targeted pair", async () => {
  await seedSemanticIndex(repo, actor, { [own.slug]: unitVector(0) });
  await seedSemanticIndex(repo, peer, { [related.slug]: unitVector(0, .1) });
  // The third eligible person's bread vector has not been generated yet.
  const neighborhood = await geomindNeighborhood(repo, actor);
  assert.equal(neighborhood.index?.status, "indexing");
  assert.deepEqual(neighborhood.neighbors.map(row => row.id), [peer]);
  const invitation = await inviteGeomindNeighbor(repo, actor, peer, own.slug, related.slug);
  assert.equal(invitation.peer.id, peer);
});

test("direct matching can choose an indexed verified pair while other candidates are still indexing", async () => {
  await seedSemanticIndex(repo, actor, { [own.slug]: unitVector(0) });
  await seedSemanticIndex(repo, peer, { [related.slug]: unitVector(0, .1) });
  const result = await suggestMatch(repo, actor);
  assert.equal(result.index?.status, "indexing");
  assert.equal(result.match?.peer.id, peer);
  assert.equal((await repo.getInvitations(actor)).length, 1);
});

test("cross-concept invitation preserves exact topic pair, reciprocal retry and each learner's history", async () => {
  await index();
  await assert.rejects(inviteGeomindNeighbor(repo, actor, peer, own.slug, bread.slug), /no longer available/);
  assert.deepEqual(await repo.getInvitations(actor), []);
  const invitation = await inviteGeomindNeighbor(repo, actor, peer, own.slug, related.slug);
  assert.equal(invitation.peer.id, peer); assert.equal(invitation.youStrong, own.slug); assert.equal(invitation.peerStrong, related.slug);
  const reciprocal = await inviteGeomindNeighbor(repo, peer, actor, related.slug, own.slug);
  assert.equal(reciprocal.id, invitation.id);
  assert.equal(reciprocal.concept, related.slug);
  assert.equal(reciprocal.youStrong, related.slug); assert.equal(reciprocal.peerStrong, own.slug);
  await repo.respondToInvite(actor, invitation.id, "accept");
  const accepted = await repo.respondToInvite(peer, invitation.id, "accept");
  const room = accepted.sessionId!;
  await repo.appendMessage(actor, room, "My GPU question", { idempotencyKey: "actor-message" });
  await repo.appendMessage(peer, room, "My parallel computing question", { idempotencyKey: "peer-message" });
  await repo.completeSession(actor, room);
  const actorSnapshot = await repo.getSnapshot(actor), peerSnapshot = await repo.getSnapshot(peer);
  assert.ok(actorSnapshot.events.some(event => event.kind === "session" && event.slug === own.slug));
  assert.ok(peerSnapshot.events.some(event => event.kind === "session" && event.slug === related.slug));
  assert.equal(peerSnapshot.concepts.some(concept => concept.slug === own.slug), false);
});

test("missing and incompatible vector spaces remain visible indexing states, even for identical concept IDs", async () => {
  await repo.addConcepts(peer, [own]);
  const absent = await geomindNeighborhood(repo, actor);
  assert.equal(absent.emptyReason, "indexing"); assert.deepEqual(absent.neighbors, []);
  await assert.rejects(rankedPeers(repo, actor), /still being indexed/);
  assert.equal((await suggestMatch(repo, actor)).match, null);
  await assert.rejects(inviteGeomindNeighbor(repo, actor, peer, own.slug), /still indexing/);
  await seedSemanticIndex(repo, actor, { [own.slug]: unitVector(0) });
  // Other encoders' vectors never make an unindexed candidate appear ready.
  await repo.putVector({ id: randomUUID(), actorId: peer, entityType: "concept", entityId: own.slug,
    text: `${own.title}. ${own.hook}`, contentHash: "different-space", vector: unitVector(0), dimensions: 768,
    model: "another-model", modelRevision: "another-revision", mode: "local-meta" });
  const otherSpace = await geomindNeighborhood(repo, actor);
  assert.equal(otherSpace.emptyReason, "indexing"); assert.deepEqual(otherSpace.neighbors, []);
});

test("a high vector similarity cannot override consent, blocks or expired availability", async () => {
  await index();
  await repo.block(peer, actor);
  const blocked = await geomindNeighborhood(repo, actor);
  assert.deepEqual(blocked.neighbors, []); assert.equal(JSON.stringify(blocked).includes(peer), false);
  await assert.rejects(inviteGeomindNeighbor(repo, actor, peer, own.slug, related.slug), /no longer available/);
});

test("typed peer queries check consent and available candidates before touching the encoder", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("The encoder must not be called"); };
  try {
    await repo.updateProfile(actor, { openToMatch: false });
    assert.deepEqual(await rankedPeers(repo, actor, undefined, "GPU question"), []);
    await repo.updateProfile(actor, { openToMatch: true });
    for (const id of [peer, unrelated]) await repo.updateProfile(id, { openToMatch: false });
    assert.deepEqual(await rankedPeers(repo, actor, undefined, "GPU question"), []);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("an eligible typed query with a missing owner index fails visibly before embedding", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("The encoder must not be called"); };
  try {
    await assert.rejects(rankedPeers(repo, actor, undefined, "GPU question"), (error: unknown) => error instanceof Error && "status" in error && error.status === 503);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("fit scoring is bounded and reviewed evidence is separate from semantic proximity", () => {
  const plain = scoreSemanticFit({ similarity: .99, ownExplanation: 0, peerExplanation: 0, ownMinutes: 20, peerMinutes: 20 });
  const reviewed = scoreSemanticFit({ similarity: .99, ownExplanation: 0, peerExplanation: 1, ownMinutes: 20, peerMinutes: 20 });
  assert.equal(plain.semanticSimilarity, reviewed.semanticSimilarity);
  assert.ok(reviewed.score > plain.score);
  assert.equal(scoreSemanticFit({ similarity: NaN, ownExplanation: NaN, peerExplanation: NaN, ownMinutes: 0, peerMinutes: 0 }).score, 0);
  assert.equal(semanticOperatingPoint("another-model", "another-space"), null);
});
