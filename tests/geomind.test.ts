import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepository } from "../domains/data/repository.ts";
import type { FurtherRepository } from "../domains/data/contracts.ts";
import { geomindNeighborhood, inviteGeomindNeighbor } from "../domains/backend/geomind.ts";
import { POST as neighborhoodRoute } from "../app/api/geomind/route.ts";
import { POST as inviteRoute } from "../app/api/geomind/invite/route.ts";
import { sessionCookie } from "../domains/backend/identity.ts";
import type { GeomindResponse } from "../lib/geomind.ts";
import { seedSemanticIndex } from "./helpers/semantic-vectors.ts";

const gpu = { slug: "gpu", title: "Graphics processors", hook: "Parallel work", domain: "computing" };
const bread = { slug: "bread", title: "Bread fermentation", hook: "Dough rises", domain: "cooking" };
const privateTopic = { slug: "private-topic", title: "Private topic", hook: "Not shared", domain: "general" };
const shared = globalThis as typeof globalThis & { __furtherLocalRepository?: Promise<FurtherRepository> };
let repo: FurtherRepository, actor: string, peer: string, other: string, directory: string;
const oldEnv = { profiles: process.env.FURTHER_ENABLE_LOCAL_PROFILES, local: process.env.FURTHER_LOCAL_DIR };

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "further-geomind-"));
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
  actor = randomUUID(); peer = randomUUID(); other = randomUUID();
  for (const [id, name] of [[actor, "Learner"], [peer, "Exact peer"], [other, "Other peer"]]) {
    await repo.ensureUser(id, name);
    await repo.updateProfile(id, { staticProfile: { role: "learner", background: "PRIVATE_BACKGROUND", age18Plus: true }, currentIntent: "PRIVATE_INTENT", openToMatch: true, availableMinutes: 20 });
    await repo.heartbeat(id);
  }
  await repo.addConcepts(actor, [gpu, bread]);
  await repo.addConcepts(peer, [gpu, privateTopic]);
  await repo.addConcepts(other, [bread]);
  for (const id of [actor, peer, other]) await seedSemanticIndex(repo, id);
});
afterEach(async () => { delete shared.__furtherLocalRepository; await repo.close(); });

function request(path: string, payload: unknown, id: string | null = actor, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${path}`, { method: "POST", headers: { ...(id ? { cookie: sessionCookie(id).split(";")[0] } : {}), "content-type": "application/json", ...headers }, body: JSON.stringify(payload) });
}

test("Geomind returns bounded overlap and only shared public evidence, never private peer data", async () => {
  await repo.recordEvent(peer, { slug: gpu.slug, kind: "explain", payload: { score: 3, explanation: "PRIVATE_EXPLANATION" }, idempotencyKey: "peer-review" });
  const result = await geomindNeighborhood(repo, actor);
  assert.equal(result.mode, "available-now");
  assert.equal(result.neighbors.length, 2);
  for (const neighbor of result.neighbors) {
    assert.ok(neighbor.proximity.overlap > 0 && neighbor.proximity.overlap <= 1);
    assert.equal(neighbor.availableNow, true);
    assert.equal(neighbor.commonMinutes, 20);
  }
  const neighbor = result.neighbors.find(row => row.id === peer)!;
  assert.deepEqual(neighbor.sharedTopics, [{ slug: gpu.slug, title: gpu.title }]);
  assert.ok(neighbor.reasons.some(reason => reason.kind === "reviewed-explanation" && reason.by === "peer" && reason.slug === gpu.slug));
  const text = JSON.stringify(result);
  for (const secret of ["PRIVATE_BACKGROUND", "PRIVATE_INTENT", "PRIVATE_EXPLANATION", "private-topic", "mastery", "lastActive", "staticProfile", "metadata", "availableMinutes"]) assert.equal(text.includes(secret), false, secret);
  // Viewing or participation does not become an explanation/teaching claim.
  await repo.recordEvent(other, { slug: bread.slug, kind: "watch", idempotencyKey: "watched" });
  assert.equal((await geomindNeighborhood(repo, actor)).neighbors.find(row => row.id === other)!.reasons.some(reason => reason.kind === "reviewed-explanation"), false);
});

test("Geomind scopes to owned questions and can revisit an older topic without leaking other topics", async () => {
  for (let i = 0; i < 4; i++) await repo.recordEvent(actor, { slug: gpu.slug, kind: "skip", idempotencyKey: `old-${i}` });
  const result = await geomindNeighborhood(repo, actor, [gpu.slug]);
  assert.deepEqual(result.scope, { kind: "question", conceptSlugs: [gpu.slug] });
  assert.deepEqual(result.neighbors.map(row => row.id), [peer]);
  assert.equal(result.neighbors[0].proximity.overlap, 1);
  for (const scope of [[privateTopic.slug], ["unknown-topic"], [gpu.slug, privateTopic.slug], []]) await assert.rejects(geomindNeighborhood(repo, actor, scope));
});

test("Geomind respects discovery/adult/time/language/block gates and never fabricates neighbors", async () => {
  await repo.updateProfile(actor, { openToMatch: false });
  assert.equal((await geomindNeighborhood(repo, actor)).emptyReason, "discovery-off");
  await repo.updateProfile(actor, { staticProfile: { role: "", background: "", age18Plus: false } });
  assert.equal((await geomindNeighborhood(repo, actor)).emptyReason, "adult-confirmation-needed");
  await repo.updateProfile(actor, { staticProfile: { role: "", background: "", age18Plus: true }, openToMatch: true });
  await repo.heartbeat(actor);
  await repo.updateProfile(peer, { availableMinutes: 5 });
  await repo.updateProfile(other, { language: "fr" });
  assert.equal((await geomindNeighborhood(repo, actor)).emptyReason, "no-neighbors");
  await repo.updateProfile(peer, { availableMinutes: 20 });
  await repo.block(peer, actor);
  assert.deepEqual((await geomindNeighborhood(repo, actor)).neighbors, []);
  const fresh = randomUUID(); await repo.ensureUser(fresh);
  await repo.updateProfile(fresh, { staticProfile: { role: "", background: "", age18Plus: true }, openToMatch: true });
  assert.equal((await geomindNeighborhood(repo, fresh)).emptyReason, "no-topics");
});

test("Geomind response limit and hasMore reflect eligible neighbors, with stable tie order", async () => {
  for (let i = 0; i < 25; i++) {
    const id = randomUUID(); await repo.ensureUser(id, `Learner ${i}`);
    await repo.updateProfile(id, { staticProfile: { role: "", background: "", age18Plus: true }, openToMatch: true });
    await repo.addConcepts(id, [gpu]); await repo.heartbeat(id); await seedSemanticIndex(repo, id);
  }
  const first = await geomindNeighborhood(repo, actor, [gpu.slug]);
  const second = await geomindNeighborhood(repo, actor, [gpu.slug]);
  assert.equal(first.neighbors.length, 24); assert.equal(first.limit, 24); assert.equal(first.hasMore, true);
  assert.deepEqual(first.neighbors.map(row => row.id), second.neighbors.map(row => row.id));
});

test("targeted invitation chooses exactly the requested peer/topic and preserves symmetric retries", async () => {
  const result = await inviteGeomindNeighbor(repo, actor, peer, gpu.slug);
  assert.equal(result.peer.id, peer); assert.equal(result.concept, gpu.slug);
  const retry = await inviteGeomindNeighbor(repo, actor, peer, gpu.slug);
  const reciprocal = await inviteGeomindNeighbor(repo, peer, actor, gpu.slug);
  assert.equal(result.id, retry.id); assert.equal(result.id, reciprocal.id);
  assert.equal((await repo.getInvitations(actor)).length, 1);
  await repo.respondToInvite(actor, result.id, "accept");
  const accepted = await repo.respondToInvite(peer, result.id, "accept");
  const resume = await inviteGeomindNeighbor(repo, actor, peer, gpu.slug);
  assert.equal(resume.sessionId, accepted.sessionId);
  await assert.rejects(inviteGeomindNeighbor(repo, actor, other, bread.slug), /current invitation or conversation/);
});

test("targeted invitation rejects foreign/nonshared topics, removed consent and incompatible invitations", async () => {
  await assert.rejects(inviteGeomindNeighbor(repo, actor, peer, privateTopic.slug), /own saved/);
  await assert.rejects(inviteGeomindNeighbor(repo, actor, peer, bread.slug), /no longer available/);
  assert.equal((await repo.getInvitations(actor)).length, 0);
  await repo.updateProfile(peer, { openToMatch: false });
  await assert.rejects(inviteGeomindNeighbor(repo, actor, peer, gpu.slug), /no longer available/);
  await repo.updateProfile(peer, { openToMatch: true }); await repo.heartbeat(peer);
  await repo.addConcepts(other, [gpu]); await seedSemanticIndex(repo, other);
  await repo.invite(peer, other, gpu.slug);
  await assert.rejects(inviteGeomindNeighbor(repo, actor, peer, gpu.slug), /no longer available/);
  assert.equal((await geomindNeighborhood(repo, actor, [gpu.slug])).neighbors.length, 0);
  assert.equal((await repo.getInvitations(actor)).length, 0);
});

test("targeted invitation revalidates time changed after its candidate lookup", async () => {
  const originalInvite=repo.invite;
  repo.invite=async (...args)=>{
    await repo.updateProfile(peer,{availableMinutes:5});
    return originalInvite(...args);
  };
  await assert.rejects(inviteGeomindNeighbor(repo,actor,peer,gpu.slug),/at least 10 minutes/);
  assert.deepEqual(await repo.getInvitations(actor),[]);
});

test("Geomind HTTP routes require identity, strict owned fields and same-origin requests", async () => {
  assert.equal((await neighborhoodRoute(request("/api/geomind", {}, null))).status, 401);
  assert.equal((await inviteRoute(request("/api/geomind/invite", { peerId: peer, conceptSlug: gpu.slug }, null))).status, 401);
  assert.equal((await neighborhoodRoute(request("/api/geomind", {}, actor, { origin: "https://other.example" }))).status, 403);
  for (const payload of [{ conceptSlugs: [] }, { conceptSlugs: [privateTopic.slug] }, { actorId: peer }, { score: 1 }]) {
    assert.equal((await neighborhoodRoute(request("/api/geomind", payload))).status, 400);
  }
  const response = await neighborhoodRoute(request("/api/geomind", { conceptSlugs: [gpu.slug] }));
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(((await response.json()) as GeomindResponse).neighbors.map(row => row.id), [peer]);
  assert.equal((await inviteRoute(request("/api/geomind/invite", { peerId: peer, conceptSlug: gpu.slug, actorId: other }))).status, 400);
  assert.equal((await inviteRoute(request("/api/geomind/invite", { peerId: peer, conceptSlug: bread.slug }))).status, 409);
  const invited = await inviteRoute(request("/api/geomind/invite", { peerId: peer, conceptSlug: gpu.slug }));
  assert.equal(invited.status, 200); assert.equal((await invited.json()).match.peer.id, peer);
  assert.equal((await inviteRoute(request("/api/geomind/invite", { peerId: other, conceptSlug: bread.slug }))).status, 409);
});
