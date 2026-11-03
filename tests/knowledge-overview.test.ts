import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepository } from "../domains/data/repository.ts";
import type { FurtherRepository } from "../domains/data/contracts.ts";
import { getKnowledgeOverview, generateKnowledgeOverview, knowledgeOverviewSource } from "../domains/backend/knowledge-overview.ts";
import { invokeAgent } from "../domains/backend/agents.ts";
import { GET, POST } from "../app/api/knowledge/overview/route.ts";
import { sessionCookie } from "../domains/backend/identity.ts";

const gpu = { slug: "gpu", title: "Graphics processors", hook: "Parallel work on a chip", domain: "general" };
const chips = { slug: "ai-hardware", title: "AI hardware", hook: "Hardware for learning systems", domain: "general" };
const yeast = { slug: "yeast", title: "Yeast", hook: "Fermentation in bread", domain: "general" };
const shared = globalThis as typeof globalThis & { __furtherLocalRepository?: Promise<FurtherRepository> };
const envNames = ["FURTHER_MODEL_MODE", "FURTHER_ENABLE_LOCAL_PROFILES", "FURTHER_LOCAL_DIR", "META_API_KEY", "META_MODEL", "FURTHER_MAP_MODEL", "FURTHER_METADATA_PROVIDER"] as const;
const savedEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
const originalFetch = globalThis.fetch;
let repo: FurtherRepository, actor: string, other: string, directory: string;
let requests: Record<string, unknown>[] = [];
let alterOutput: ((output: Record<string, unknown>) => Record<string, unknown>) | undefined;
let beforeFinal: (() => Promise<void>) | undefined;

before(async () => { directory = await mkdtemp(join(tmpdir(), "further-overview-")); });
after(async () => {
  globalThis.fetch = originalFetch;
  for (const name of envNames) {
    const value = savedEnv[name];
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  process.env.FURTHER_MODEL_MODE = "fixture";
  process.env.FURTHER_ENABLE_LOCAL_PROFILES = "1";
  process.env.FURTHER_LOCAL_DIR = directory;
  process.env.META_API_KEY = "fake-key-never-sent";
  process.env.META_MODEL = "muse-spark-1.3";
  process.env.FURTHER_MAP_MODEL = "muse-spark-1.3";
  process.env.FURTHER_METADATA_PROVIDER = "meta";
  repo = await createRepository(); shared.__furtherLocalRepository = Promise.resolve(repo);
  actor = randomUUID(); other = randomUUID(); requests = []; alterOutput = undefined; beforeFinal = undefined;
  for (const id of [actor, other]) await repo.ensureUser(id, "Overview test learner");
  await repo.updateProfile(actor, {
    currentIntent: "PRIVATE_CURRENT_INTENT",
    staticProfile: { role: "PRIVATE_ROLE", background: "PRIVATE_BACKGROUND", age18Plus: true },
  });
  await repo.addConcepts(actor, [gpu, chips, yeast], [{ src: chips.slug, dst: gpu.slug, kind: "part_of" }]);
  await repo.saveMetadata(actor, "intent-proposal", { secret: "PRIVATE_METADATA" }, { source: "agent", confirmed: false, schemaVersion: 1 });
  globalThis.fetch = mockProvider;
});
afterEach(async () => { delete shared.__furtherLocalRepository; await repo.close(); });

function request(method: "GET" | "POST", payload?: unknown, id: string | null = actor, extra: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/knowledge/overview", {
    method, headers: { ...(id ? { cookie: sessionCookie(id).split(";")[0] } : {}), "content-type": "application/json", ...extra },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
}
async function hash(id = actor) { return knowledgeOverviewSource(await repo.getSnapshot(id)).sourceHash; }
const modelMessage = (text: string) => ({ id: "msg_summary", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] });
function modelResponse(output: unknown[], stream: boolean) {
  const response = { id: "resp_summary", object: "response", created_at: 1, status: "completed", model: "muse-spark-1.3", output, usage: { input_tokens: 10, output_tokens: 20 } };
  if (!stream) return Response.json(response);
  const event = `data: ${JSON.stringify({ type: "response.completed", response })}\n\n`;
  return new Response(event, { headers: { "content-type": "text/event-stream" } });
}
async function mockProvider(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  // An unexpected path must never fall through to a real paid service.
  if (req.url !== "https://api.meta.ai/v1/responses") throw new Error("External network disabled in overview tests");
  const body = await req.json() as Record<string, unknown>; requests.push(body);
  const items = body.input as Array<Record<string, unknown>>;
  const source = JSON.parse(String(items.find(item => item.role === "user")?.content)).preparedTools.get_map as { concepts: Array<{ slug: string; title: string }> };
  const hardware = source.concepts.filter(concept => concept.slug === gpu.slug || concept.slug === chips.slug);
  const remaining = source.concepts.filter(concept => !hardware.includes(concept));
  const groups = [
    ...(hardware.length ? [{ id: "hardware", title: "AI hardware", summary: "Processors and the hardware used for AI.", conceptSlugs: hardware.map(concept => concept.slug) }] : []),
    ...remaining.map(concept => ({ id: `topic-${concept.slug}`, title: concept.title, summary: `Explore ${concept.title}.`, conceptSlugs: [concept.slug] })),
  ];
  const output: Record<string, unknown> = {
    intent: "Organize the saved concepts", root: source.concepts[0]?.slug ?? "knowledge", rootTitle: "My knowledge map",
    concepts: [], groups, explanation: "Related saved concepts are grouped together without changing their evidence.", recommendedPeerIds: [], nextActions: [],
  };
  if (beforeFinal) await beforeFinal();
  return modelResponse([modelMessage(JSON.stringify(alterOutput ? alterOutput(output) : output))], body.stream === true);
}

test("overview source covers canonical topics and edges but excludes private and activity data", async () => {
  const snapshot = await repo.getSnapshot(actor), first = knowledgeOverviewSource(snapshot);
  assert.deepEqual(new Set(first.source.concepts.map(concept => concept.slug)), new Set([gpu.slug, chips.slug, yeast.slug]));
  assert.deepEqual(first.source.edges, [{ src: chips.slug, dst: gpu.slug, kind: "part_of" }]);
  const serialized = JSON.stringify(first);
  for (const value of ["PRIVATE_CURRENT_INTENT", "PRIVATE_BACKGROUND", "PRIVATE_METADATA", "PRIVATE_ROLE", "mastery", "preferences"]) assert.equal(serialized.includes(value), false, value);
  const reordered = knowledgeOverviewSource({ ...snapshot, concepts: [...snapshot.concepts].reverse(), edges: [...snapshot.edges].reverse() });
  assert.equal(reordered.sourceHash, first.sourceHash, "database row order must not invalidate a summary");
  assert.notEqual(knowledgeOverviewSource({ ...snapshot, concepts: snapshot.concepts.map(concept => concept.slug === gpu.slug ? { ...concept, title: "GPU architecture" } : concept) }).sourceHash, first.sourceHash);
  assert.notEqual(knowledgeOverviewSource({ ...snapshot, edges: [{ src: chips.slug, dst: gpu.slug, kind: "related" }] }).sourceHash, first.sourceHash);
  await repo.recordEvent(actor, { slug: gpu.slug, kind: "explain", payload: { score: 3, feedback: "PRIVATE_FEEDBACK" }, idempotencyKey: "reviewed-answer" });
  await repo.updateProfile(actor, { currentIntent: "Another private question" });
  assert.equal(await hash(), first.sourceHash, "learning evidence belongs in live aggregation, not the semantic summary cache key");
  await repo.addConcepts(actor, [{ slug: "memory", title: "Memory", hook: "Store information", domain: "general" }]);
  assert.notEqual(await hash(), first.sourceHash);
});

test("empty maps and cache reads do not invoke a model", async () => {
  const empty = await getKnowledgeOverview(repo, other);
  assert.equal(empty.status, "empty"); assert.equal(empty.overview, undefined);
  const missing = await getKnowledgeOverview(repo, actor);
  assert.equal(missing.status, "missing"); assert.equal(missing.overview, undefined);
  assert.equal(requests.length, 0);
});

test("live summary groups cross-question concepts once and does not mutate learning or intent", async () => {
  process.env.FURTHER_MODEL_MODE = "live";
  const before = await repo.getSnapshot(actor), sourceHash = await hash();
  const result = await generateKnowledgeOverview(actor, { sourceHash });
  assert.equal(result.mode, "live"); assert.equal(result.sourceHash, sourceHash);
  assert.deepEqual(result.overview.groups.find(group => group.id === "hardware")?.conceptSlugs.sort(), [chips.slug, gpu.slug].sort());
  assert.deepEqual(result.overview.groups.flatMap(group => group.conceptSlugs).sort(), [gpu.slug, chips.slug, yeast.slug].sort());
  const after = await repo.getSnapshot(actor);
  for (const key of ["profile", "metadata", "concepts", "edges", "events"] as const) assert.deepEqual(after[key], before[key], key);
  assert.equal(requests.length, 1, "the map read must not require a separate model round trip");
  const text = JSON.stringify(requests);
  for (const secret of ["PRIVATE_CURRENT_INTENT", "PRIVATE_BACKGROUND", "PRIVATE_METADATA", "PRIVATE_ROLE"]) assert.equal(text.includes(secret), false, secret);
  for (const body of requests) assert.deepEqual(body.tools ?? [], []);
});

test("cached reloads and concurrent requests reuse one run, including after unrelated run pagination", async () => {
  process.env.FURTHER_MODEL_MODE = "live";
  const sourceHash = await hash();
  const [first, concurrent] = await Promise.all([generateKnowledgeOverview(actor, { sourceHash }), generateKnowledgeOverview(actor, { sourceHash })]);
  assert.equal(first.runId, concurrent.runId); const count = requests.length;
  assert.equal(count, 1, "one prepared map read and one model completion across both callers");
  const cached = await getKnowledgeOverview(repo, actor);
  assert.equal(cached.status, "ready"); assert.equal(cached.runId, first.runId);
  await repo.recordEvent(actor, { slug: gpu.slug, kind: "open", idempotencyKey: "summary-open" });
  for (let index = 0; index < 105; index++) {
    const id = randomUUID();
    await repo.beginAgentRun({ id, actorId: actor, agentId: "metadata", input: { unrelated: index } });
    await repo.finishAgentRun(actor, id, { output: { mode: "live", data: { unrelated: index } } });
  }
  assert.equal((await getKnowledgeOverview(repo, actor)).runId, first.runId);
  assert.equal((await generateKnowledgeOverview(actor, { sourceHash })).runId, first.runId);
  assert.equal(requests.length, count, "restoring a completed summary cannot make another paid call");
});

test("summary caches are owner-scoped and live results never restore a fixture summary", async () => {
  const sourceHash = await hash();
  const fixture = await generateKnowledgeOverview(actor, { sourceHash });
  assert.equal(fixture.mode, "fixture"); assert.equal(requests.length, 0);
  process.env.FURTHER_MODEL_MODE = "live";
  assert.equal((await getKnowledgeOverview(repo, actor)).status, "missing");
  const live = await generateKnowledgeOverview(actor, { sourceHash });
  assert.equal(live.mode, "live"); assert.notEqual(live.runId, fixture.runId);
  await repo.addConcepts(other, [gpu, chips, yeast], [{ src: chips.slug, dst: gpu.slug, kind: "part_of" }]);
  assert.equal(await hash(other), sourceHash, "the source content intentionally matches across owners");
  assert.equal((await getKnowledgeOverview(repo, other)).status, "missing");
  const otherResult = await generateKnowledgeOverview(other, { sourceHash });
  assert.notEqual(otherResult.runId, live.runId);
  assert.equal((await getKnowledgeOverview(repo, actor, "fixture")).runId, fixture.runId);
});

test("a changed canonical map invalidates the cache and refuses stale generation requests", async () => {
  process.env.FURTHER_MODEL_MODE = "live";
  const oldHash = await hash(), old = await generateKnowledgeOverview(actor, { sourceHash: oldHash });
  const count = requests.length;
  await repo.addConcepts(actor, [{ slug: "tokens", title: "Tokens", hook: "Pieces of text", domain: "general" }]);
  const changed = await getKnowledgeOverview(repo, actor);
  assert.equal(changed.status, "missing"); assert.notEqual(changed.sourceHash, oldHash);
  await assert.rejects(generateKnowledgeOverview(actor, { sourceHash: oldHash }));
  assert.equal(requests.length, count);
  const fresh = await generateKnowledgeOverview(actor, { sourceHash: changed.sourceHash });
  assert.notEqual(fresh.runId, old.runId);
  assert.ok(fresh.overview.groups.some(group => group.conceptSlugs.includes("tokens")));
});

test("a map change during inference never publishes a summary as current", async () => {
  process.env.FURTHER_MODEL_MODE = "live";
  const originalHash = await hash();
  beforeFinal = async () => {
    beforeFinal = undefined;
    await repo.addConcepts(actor, [{ slug: "new-topic", title: "New topic", hook: "Added while organizing", domain: "general" }]);
  };
  await assert.rejects(generateKnowledgeOverview(actor, { sourceHash: originalHash }));
  const current = await getKnowledgeOverview(repo, actor);
  assert.notEqual(current.sourceHash, originalHash); assert.notEqual(current.status, "ready");
});

test("a failed summary can recover with a new attempt and later reloads restore that successful run", async () => {
  process.env.FURTHER_MODEL_MODE = "live";
  const sourceHash = await hash();
  alterOutput = output => ({ ...output, groups: [] });
  await assert.rejects(generateKnowledgeOverview(actor, { sourceHash }));
  const failureCalls = requests.length;
  await assert.rejects(generateKnowledgeOverview(actor, { sourceHash }));
  assert.equal(requests.length, failureCalls, "replaying a failed attempt cannot silently buy another generation");
  alterOutput = undefined;
  const recovered = await generateKnowledgeOverview(actor, { sourceHash, attempt: "confirmed-retry" });
  const successCalls = requests.length;
  assert.equal((await getKnowledgeOverview(repo, actor)).runId, recovered.runId);
  assert.equal((await generateKnowledgeOverview(actor, { sourceHash })).runId, recovered.runId);
  assert.equal(requests.length, successCalls);
});

test("latest unknown summary outcome blocks older retry permission after reload and unrelated history", async () => {
  process.env.FURTHER_MODEL_MODE = "live";
  const sourceHash = await hash();
  alterOutput = output => ({ ...output, groups: [] });
  await assert.rejects(generateKnowledgeOverview(actor, { sourceHash }));
  const safe = await getKnowledgeOverview(repo, actor);
  assert.equal(safe.requestStatus, "failed"); assert.equal(safe.retryWithNewKey, true); assert.equal(safe.attempt, "initial");
  const unknownId = randomUUID();
  await repo.beginAgentRun({ id: unknownId, actorId: actor, agentId: "knowledge-map", input: {
    objective: "summarize", sourceHash, summaryMode: "live", overviewAttempt: "unknown-attempt", overviewAttemptNumber: 2,
  } });
  const running = await getKnowledgeOverview(repo, actor);
  assert.equal(running.attempt, "unknown-attempt"); assert.equal(running.requestStatus, "running"); assert.equal(running.retryWithNewKey, undefined);
  await repo.finishAgentRun(actor, unknownId, { error: "PRIVATE_FAILURE_DETAIL", output: { retryWithNewKey: false } });
  // Later timestamps and more than one page of unrelated runs must not select a
  // different owner, model mode, source, or an older attempt ordinal.
  for (let index = 0; index < 105; index++) {
    const id = randomUUID();
    await repo.beginAgentRun({ id, actorId: actor, agentId: "metadata", input: { unrelated: index } });
    await repo.finishAgentRun(actor, id, { output: { retryWithNewKey: true } });
  }
  for (const [owner, savedHash, mode, ordinal] of [
    [other, sourceHash, "live", 999], [actor, sourceHash, "fixture", 999],
    [actor, "f".repeat(64), "live", 999], [actor, sourceHash, "live", 1],
  ] as const) {
    const id = randomUUID();
    await repo.beginAgentRun({ id, actorId: owner, agentId: "knowledge-map", input: {
      objective: "summarize", sourceHash: savedHash, summaryMode: mode, overviewAttempt: "older-or-unrelated-safe", overviewAttemptNumber: ordinal,
    } });
    await repo.finishAgentRun(owner, id, { error: "Synthetic safe failure", output: { retryWithNewKey: true } });
  }
  const latest = await getKnowledgeOverview(repo, actor);
  assert.equal(latest.attempt, "unknown-attempt"); assert.equal(latest.requestStatus, "failed"); assert.equal(latest.retryWithNewKey, undefined);
  const response = await GET(request("GET"));
  const wire = await response.text(); assert.equal(wire.includes("PRIVATE_FAILURE_DETAIL"), false);
  assert.equal(JSON.parse(wire).retryWithNewKey, undefined);
  const calls = requests.length; alterOutput = undefined;
  await assert.rejects(generateKnowledgeOverview(actor, { sourceHash, attempt: "new-nonce-cannot-bypass-unknown" }));
  await assert.rejects(invokeAgent(actor, "knowledge-map", { text: "Summarize", objective: "summarize" }, { idempotencyKey: "generic-cannot-bypass-unknown" }));
  assert.equal(requests.length, calls);
});

test("independent summarize invocation uses only the same safe owner projection", async () => {
  process.env.FURTHER_MODEL_MODE = "live";
  await invokeAgent(actor, "knowledge-map", { text: "PRIVATE_CALLER_TEXT must not become overview context", objective: "summarize" }, { idempotencyKey: "independent-summary" });
  const serialized = JSON.stringify(requests);
  assert.equal(serialized.includes("PRIVATE_CALLER_TEXT"), false);
  assert.equal(serialized.includes("PRIVATE_BACKGROUND"), false);
  assert.equal((await getKnowledgeOverview(repo, actor)).status, "ready");
});

test("whole-map summary includes more than the old 100-concept context window and rejects oversize sources", async () => {
  process.env.FURTHER_MODEL_MODE = "live";
  const extra = Array.from({ length: 98 }, (_, index) => ({ slug: `topic-${index}`, title: `Topic ${index}`, hook: "Canonical topic", domain: "general" }));
  await repo.addConcepts(actor, extra);
  alterOutput = output => ({ ...output, groups: [{ id: "all-saved", title: "Saved topics", summary: "Test transport groups all supplied canonical members.", conceptSlugs: (output.groups as Array<{ conceptSlugs: string[] }>).flatMap(group => group.conceptSlugs) }] });
  const result = await generateKnowledgeOverview(actor, { sourceHash: await hash() });
  assert.equal(result.overview.groups.flatMap(group => group.conceptSlugs).length, 101);
  const supplied = requests.flatMap(body => body.input as Array<Record<string, unknown>>).find(item => item.role === "user");
  assert.equal((JSON.parse(String(supplied?.content)).preparedTools.get_map.concepts as unknown[]).length, 101);
  const snapshot = await repo.getSnapshot(actor);
  const oversized = [...snapshot.concepts, ...Array.from({ length: 100 }, (_, index) => ({ slug: `oversize-${index}`, title: `Overflow ${index}`, hook: "", domain: "general" }))];
  assert.throws(() => knowledgeOverviewSource({ ...snapshot, concepts: oversized }), /200 concepts/);
  assert.throws(() => knowledgeOverviewSource({ ...snapshot, concepts: snapshot.concepts.map(concept => ({ ...concept, hook: "é".repeat(1000) })) }), /too much text/);
});

for (const invalid of ["unknown", "missing", "duplicate", "duplicate-group"] as const) test(`summary rejects ${invalid} canonical coverage without changing or caching a map`, async () => {
  process.env.FURTHER_MODEL_MODE = "live";
  alterOutput = output => {
    const result = structuredClone(output);
    const groups = result.groups as Array<{ id: string; title: string; summary: string; conceptSlugs: string[] }>;
    if (invalid === "unknown") groups[0].conceptSlugs.push("private-foreign-concept");
    if (invalid === "missing") groups.pop();
    if (invalid === "duplicate") groups[1].conceptSlugs.push(groups[0].conceptSlugs[0]);
    if (invalid === "duplicate-group") groups[1].id = groups[0].id;
    return result;
  };
  const before = await repo.getSnapshot(actor);
  await assert.rejects(generateKnowledgeOverview(actor, { sourceHash: await hash() }));
  assert.notEqual((await getKnowledgeOverview(repo, actor)).status, "ready");
  const after = await repo.getSnapshot(actor);
  for (const key of ["profile", "metadata", "concepts", "edges", "events"] as const) assert.deepEqual(after[key], before[key]);
});

test("overview HTTP handlers guard identity, origin, supplied actor IDs and stale hashes before inference", async () => {
  assert.equal((await GET(request("GET", undefined, null))).status, 401);
  assert.equal((await POST(request("POST", {}, null))).status, 401);
  assert.equal((await GET(request("GET", undefined, actor, { origin: "https://unrelated.example" }))).status, 403);
  const sourceHash = await hash();
  assert.equal((await POST(request("POST", { sourceHash, actorId: other }))).status, 400);
  assert.equal((await POST(request("POST", { sourceHash: "bad" }))).status, 400);
  assert.equal((await POST(request("POST", { sourceHash: "a".repeat(64) }))).status, 409);
  const read = await GET(request("GET"));
  assert.equal(read.status, 200); assert.equal(read.headers.get("cache-control"), "no-store");
  assert.equal((await read.json()).status, "missing"); assert.equal(requests.length, 0);
});

test("fixture overview streams real lifecycle and final result without simulated model tokens", async () => {
  const response = await POST(request("POST", { sourceHash: await hash() }, actor, { accept: "text/event-stream" }));
  assert.equal(response.status, 200); assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const messages = (await response.text()).split(/\r?\n\r?\n/).flatMap(block => block.startsWith("data: ") ? [JSON.parse(block.slice(6)) as Record<string, unknown>] : []);
  assert.equal(messages[0]?.type, "activity");
  assert.equal(messages.at(-1)?.type, "result");
  assert.equal(messages.some(message => message.type === "text_delta" && message.delta), false);
  const result = messages.at(-1)?.result as Awaited<ReturnType<typeof generateKnowledgeOverview>>;
  assert.equal(result.mode, "fixture");
  assert.deepEqual(result.overview.groups.flatMap(group => group.conceptSlugs).sort(), [gpu.slug, chips.slug, yeast.slug].sort());
  assert.equal(requests.length, 0);
});

test("adding the summarize objective preserves explicit map expansion and hides summary runs from question history", async () => {
  await generateKnowledgeOverview(actor, { sourceHash: await hash() });
  const before = await repo.getSnapshot(actor);
  const expanded = await invokeAgent(actor, "knowledge-map", { text: "How does sourdough rise?", objective: "expand" }, { idempotencyKey: "expansion-regression" });
  assert.equal(expanded.persisted, true); assert.ok(expanded.data.concepts.length > 0);
  const after = await repo.getSnapshot(actor);
  assert.equal(after.profile.currentIntent, "How does sourdough rise?");
  assert.ok(after.concepts.length > before.concepts.length);
  assert.ok(after.metadata.length > before.metadata.length);
  const { GET: bootstrap } = await import("../app/api/data/bootstrap/route.ts");
  const response = await bootstrap(new Request("http://localhost:3000/api/data/bootstrap", { headers: { cookie: sessionCookie(actor).split(";")[0] } }));
  const body = await response.json() as { missions: Array<{ runId: string; text: string }> };
  assert.equal(body.missions.length, 1); assert.equal(body.missions[0].runId, expanded.runId);
});
