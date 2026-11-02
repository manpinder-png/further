import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POST as understand } from "../app/api/media/understand/route.ts";
import { GET as image } from "../app/api/media/[id]/route.ts";
import { sessionCookie } from "../domains/backend/identity.ts";
import { createRepository } from "../domains/data/repository.ts";
import type { FurtherRepository } from "../domains/data/contracts.ts";

const actorId = randomUUID(), otherId = randomUUID();
const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2U0AAAAASUVORK5CYII=", "base64");
const shared = globalThis as typeof globalThis & { __furtherLocalRepository?: Promise<FurtherRepository> };
const keys = ["FURTHER_LOCAL_DIR", "FURTHER_AUTH_PROVIDER", "FURTHER_DATA_BACKEND", "FURTHER_ENABLE_LOCAL_PROFILES", "FURTHER_MODEL_MODE", "META_API_KEY", "META_MODEL"];
const oldEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const oldFetch = globalThis.fetch;
let repo: FurtherRepository, dir: string, cookie: string, mediaId: string;
let modelCalls = 0;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "further-media-routes-"));
  Object.assign(process.env, { FURTHER_LOCAL_DIR: dir, FURTHER_AUTH_PROVIDER: "local", FURTHER_DATA_BACKEND: "pglite", FURTHER_ENABLE_LOCAL_PROFILES: "1", FURTHER_MODEL_MODE: "live", META_API_KEY: "fake-never-sent", META_MODEL: "muse-spark-1.3" });
  repo = await createRepository(); shared.__furtherLocalRepository = Promise.resolve(repo);
  await repo.ensureUser(actorId, "Image owner"); await repo.ensureUser(otherId, "Other learner");
  cookie = sessionCookie(actorId).split(";")[0];
  globalThis.fetch = async (input, options) => {
    assert.equal(String(input), "https://api.meta.ai/v1/responses"); modelCalls++;
    const result = { id: "image_test", object: "response", status: "completed", model: "muse-spark-1.3", output: [{ id: "msg_image", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ description: "A small sample image.", suggestedCuriosity: "How are digital images represented?", concepts: ["pixels"], uncertainty: [] }) }] }], usage: { input_tokens: 10, output_tokens: 12 } };
    if (JSON.parse(String(options?.body)).stream === true) return new Response(`data: ${JSON.stringify({ type: "response.created", response: { id: result.id } })}\n\ndata: ${JSON.stringify({ type: "response.completed", response: result })}\n\n`, { headers: { "content-type": "text/event-stream" } });
    return Response.json(result);
  };
});
after(async () => {
  globalThis.fetch = oldFetch;
  for (const key of keys) { if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key]; }
  delete shared.__furtherLocalRepository; await repo.close(); await rm(dir, { recursive: true, force: true });
});
function upload(extra: Record<string, string> = {}) {
  const form = new FormData(); form.append("image", new Blob([bytes], { type: "image/png" }), "pixel.png");
  return new Request("http://localhost:3000/api/media/understand", { method: "POST", headers: { cookie, ...extra }, body: form });
}
function get(id: string, session = cookie, extra: Record<string, string> = {}) {
  return image(new Request(`http://localhost:3000/api/media/${id}`, { headers: { cookie: session, ...extra } }), { params: Promise.resolve({ id }) });
}

test("image understanding saves real-provider provenance and returns only an opaque media ID", async () => {
  const response = await understand(upload({ "idempotency-key": "media-live-once" }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.demo, false); assert.equal(result.provenance.provider, "meta");
  assert.equal(result.localPath, undefined); assert.equal(result.path, undefined);
  assert.ok(result.mediaId); mediaId = result.mediaId;
  const record = await repo.getMedia(actorId, mediaId);
  assert.equal(record.contentHash.length, 64); assert.equal(record.provenance?.runId, result.provenance.runId);
  assert.equal(record.extractedText, "A small sample image."); assert.equal(modelCalls, 1);
});

test("saved images require owner authentication and return safe private image headers", async () => {
  const response = await get(mediaId);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal((await get(mediaId, "")).status, 401);
  assert.equal((await get(mediaId, sessionCookie(otherId).split(";")[0])).status, 404);
  assert.equal((await get(mediaId, cookie, { origin: "https://attacker.example" })).status, 403);
  assert.equal((await get("../../outside")).status, 404);
});

test("database save failure emits an error event without a media success result", async () => {
  const save = repo.saveMedia;
  repo.saveMedia = async () => { throw new Error("Simulated database failure"); };
  try {
    const response = await understand(upload({ accept: "text/event-stream", "idempotency-key": "media-save-failure" }));
    const events = (await response.text()).split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
    assert.ok(events.some(event => event.type === "activity" && event.phase === "saving"));
    assert.ok(events.some(event => event.type === "error"));
    assert.equal(events.some(event => event.type === "result"), false);
  } finally { repo.saveMedia = save; }
});

test("fixture perception never persists an image even without the explicit demo header", async () => {
  const save = repo.saveMedia; let saves = 0;
  repo.saveMedia = async (...args) => { saves++; return save(...args); };
  process.env.FURTHER_MODEL_MODE = "fixture";
  try {
    const result = await (await understand(upload({ "idempotency-key": "media-fixture" }))).json();
    assert.equal(result.demo, true); assert.equal(result.mediaId, undefined); assert.equal(saves, 0);
  } finally { repo.saveMedia = save; process.env.FURTHER_MODEL_MODE = "live"; }
});
