import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GetObjectCommandOutput, PutObjectCommandInput } from "@aws-sdk/client-s3";
import { createMediaStorage, MAX_IMAGE_BYTES, type MediaObjectStore } from "../domains/backend/media-storage.ts";
import type { MediaRecord } from "../domains/data/contracts.ts";

const actorId = randomUUID(), otherId = randomUUID();
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2U0AAAAASUVORK5CYII=", "base64");
const digest = createHash("sha256").update(image).digest("hex");
const config = { backend: "aurora-data-api", bucket: "further-test-media", region: "us-east-1" };
function record(localPath: string, overrides: Partial<MediaRecord> = {}): MediaRecord {
  return { id: randomUUID(), actorId, kind: "image", mimeType: "image/png", localPath, contentHash: digest, byteSize: image.length, createdAt: Date.now(), ...overrides };
}
function body(bytes: Uint8Array, cancelled: () => void = () => undefined): GetObjectCommandOutput["Body"] {
  return { transformToByteArray: async () => bytes, transformToWebStream: () => new ReadableStream({ cancel: cancelled }) } as GetObjectCommandOutput["Body"];
}

test("AWS image save/read is private, learner-scoped, checksum-protected and bounded", async () => {
  let saved: PutObjectCommandInput | undefined, reads = 0;
  const controller = new AbortController();
  const store: MediaObjectStore = {
    async put(input, signal) { saved = input; assert.equal(signal, controller.signal); },
    async get(input) {
      reads++; assert.deepEqual(input, { Bucket: config.bucket, Key: `learners/${actorId}/${digest}`, Range: `bytes=0-${MAX_IMAGE_BYTES}` });
      return { $metadata: {}, Body: body(image), ContentType: "image/png", ContentLength: image.length };
    },
  };
  const storage = createMediaStorage(config, store);
  const result = await storage.saveImage(actorId, image, "image/png", controller.signal);
  assert.equal(result.path, `s3://${config.bucket}/learners/${actorId}/${digest}`);
  assert.equal(saved?.ServerSideEncryption, "AES256");
  assert.equal(saved?.ChecksumSHA256, Buffer.from(digest, "hex").toString("base64"));
  assert.equal(saved?.ACL, undefined);
  assert.deepEqual(await storage.readImage(actorId, record(result.path)), image);
  assert.equal(reads, 1);
});

test("AWS reads reject foreign owners, altered references and unsafe media before object access", async () => {
  let calls = 0;
  const storage = createMediaStorage(config, { async put() { calls++; }, async get() { calls++; throw new Error("Must not access object storage"); } });
  const key = `learners/${actorId}/${digest}`;
  for (const candidate of [
    record(`s3://${config.bucket}/${key}`, { actorId: otherId }),
    record(`s3://another-bucket/${key}`),
    record(`s3://${config.bucket}/learners/${otherId}/${digest}`),
    record(`s3://${config.bucket}/${key}?anything=1`),
    record(`s3://${config.bucket}/${key}/../${digest}`),
    record(`s3://${config.bucket}/${key}`, { mimeType: "image/svg+xml" }),
    record(`s3://${config.bucket}/${key}`, { byteSize: MAX_IMAGE_BYTES + 1 }),
  ]) await assert.rejects(storage.readImage(actorId, candidate), { status: 404 });
  assert.equal(calls, 0);
  await assert.rejects(storage.saveImage("../other", image, "image/png"), { status: 404 });
});

test("AWS missing configuration cannot save locally, and corrupted or oversized objects cannot be returned", async () => {
  const dir = await mkdtemp(join(tmpdir(), "further-media-missing-"));
  try {
    await assert.rejects(createMediaStorage({ backend: "aurora-data-api", localDir: dir }).saveImage(actorId, image, "image/png"), { status: 503 });
    await assert.rejects(stat(join(dir, "media")), { code: "ENOENT" });
    let cancelled = false;
    const oversized = createMediaStorage(config, { async put() {}, async get() { return { $metadata: {}, ContentLength: MAX_IMAGE_BYTES + 1, Body: body(image, () => { cancelled = true; }) }; } });
    await assert.rejects(oversized.readImage(actorId, record(`s3://${config.bucket}/learners/${actorId}/${digest}`)), { status: 404 });
    assert.equal(cancelled, true);
    const corrupt = createMediaStorage(config, { async put() {}, async get() { return { $metadata: {}, ContentLength: image.length, Body: body(new Uint8Array(image.length)) }; } });
    await assert.rejects(corrupt.readImage(actorId, record(`s3://${config.bucket}/learners/${actorId}/${digest}`)), { status: 404 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("PGlite keeps private local images, rejects path redirection and checks saved content", async () => {
  const dir = await mkdtemp(join(tmpdir(), "further-media-local-"));
  try {
    const storage = createMediaStorage({ localDir: dir });
    const result = await storage.saveImage(actorId, image, "image/png");
    assert.equal(result.path, join(dir, "media", actorId, digest));
    assert.deepEqual(await storage.readImage(actorId, record(result.path)), image);
    assert.equal((await stat(result.path)).mode & 0o777, 0o600);
    await assert.rejects(storage.readImage(actorId, record(join(dir, "outside"))), { status: 404 });
    await symlink(join(dir, "media", actorId), join(dir, "media", otherId));
    await assert.rejects(storage.saveImage(otherId, image, "image/png"), { status: 404 });
    await writeFile(result.path, new Uint8Array(image.length));
    await assert.rejects(storage.readImage(actorId, record(result.path)), { status: 404 });
    await rm(result.path);
    await writeFile(join(dir, "outside"), image);
    await symlink(join(dir, "outside"), result.path);
    await assert.rejects(storage.readImage(actorId, record(result.path)));
    assert.deepEqual(await readFile(join(dir, "outside")), image);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
