import "server-only";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client, type GetObjectCommandInput, type GetObjectCommandOutput, type PutObjectCommandInput } from "@aws-sdk/client-s3";
import type { MediaRecord } from "../data/contracts";
import { HttpError } from "./http";

export const MAX_IMAGE_BYTES = 10_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
type StorageConfig = { backend?: string; localDir?: string; bucket?: string; region?: string };

/** The injectable port keeps storage/privacy tests off AWS. Credentials are never
 * supplied by the browser; the production client uses the server's AWS chain. */
export interface MediaObjectStore {
  put(input: PutObjectCommandInput, signal?: AbortSignal): Promise<void>;
  get(input: GetObjectCommandInput, signal?: AbortSignal): Promise<GetObjectCommandOutput>;
}
let client: { region: string; value: S3Client } | undefined;
function awsStore(region: string): MediaObjectStore {
  if (!client || client.region !== region) client = { region, value: new S3Client({ region, maxAttempts: 3, requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 } }) };
  const s3 = client.value;
  return {
    async put(input, signal) { await s3.send(new PutObjectCommand(input), { abortSignal: signal }); },
    get(input, signal) { return s3.send(new GetObjectCommand(input), { abortSignal: signal }); },
  };
}
function unavailable() { return new HttpError(404, "Image not found."); }
function hashOf(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }

export function createMediaStorage(config: StorageConfig, injectedStore?: MediaObjectStore) {
  const aws = config.backend === "aurora-data-api";
  const root = resolve(config.localDir ?? ".local", "media");
  function owner(actorId: string) { if (!UUID.test(actorId)) throw unavailable(); }
  function awsConfig() {
    if (!config.bucket || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket) || !config.region) {
      throw new HttpError(503, "Image storage is not configured. Please contact the developer.");
    }
    return { bucket: config.bucket, store: injectedStore ?? awsStore(config.region) };
  }
  async function directory(actorId: string, create: boolean) {
    const dir = resolve(root, actorId);
    if (create) await mkdir(dir, { recursive: true, mode: 0o700 });
    // Reject an actor directory redirected to another learner or outside media.
    if (await realpath(dir) !== resolve(await realpath(root), actorId)) throw unavailable();
    return dir;
  }
  return {
    async saveImage(actorId: string, bytes: Uint8Array, mimeType: string, signal?: AbortSignal) {
      owner(actorId);
      if (!IMAGE_TYPES.has(mimeType) || bytes.length < 1 || bytes.length > MAX_IMAGE_BYTES) throw new HttpError(400, "Choose a PNG, JPEG or WebP image under 10 MB.");
      signal?.throwIfAborted();
      const contentHash = hashOf(bytes);
      let path: string;
      if (aws) {
        const { bucket, store } = awsConfig();
        const key = `learners/${actorId}/${contentHash}`;
        await store.put({ Bucket: bucket, Key: key, Body: bytes, ContentType: mimeType, ContentLength: bytes.length, ServerSideEncryption: "AES256", ChecksumSHA256: Buffer.from(contentHash, "hex").toString("base64") }, signal);
        path = `s3://${bucket}/${key}`;
      } else {
        path = resolve(await directory(actorId, true), contentHash);
        const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
        try { await file.writeFile(bytes, { signal }); } finally { await file.close(); }
      }
      return { path, contentHash, byteSize: bytes.length };
    },
    async readImage(actorId: string, record: MediaRecord, signal?: AbortSignal): Promise<Uint8Array> {
      owner(actorId);
      if (record.actorId !== actorId || record.kind !== "image" || !IMAGE_TYPES.has(record.mimeType) || !HASH.test(record.contentHash) || !Number.isSafeInteger(record.byteSize) || record.byteSize < 1 || record.byteSize > MAX_IMAGE_BYTES) throw unavailable();
      signal?.throwIfAborted();
      let bytes: Uint8Array;
      if (aws) {
        const { bucket, store } = awsConfig();
        const key = `learners/${actorId}/${record.contentHash}`;
        // Compare the entire reference: another bucket, owner, suffix, query or
        // encoded traversal must never become an S3 request.
        if (record.localPath !== `s3://${bucket}/${key}`) throw unavailable();
        const result = await store.get({ Bucket: bucket, Key: key, Range: `bytes=0-${MAX_IMAGE_BYTES}` }, signal);
        if (!result.Body) throw unavailable();
        // Range bounds the download even if storage metadata was altered. Read
        // or cancel every returned body so the SDK can release its connection.
        if (result.ContentLength !== record.byteSize || (result.ContentType && result.ContentType !== record.mimeType)) {
          await result.Body.transformToWebStream().cancel();
          throw unavailable();
        }
        bytes = await result.Body.transformToByteArray();
      } else {
        const path = resolve(await directory(actorId, false), record.contentHash);
        if (record.localPath !== path) throw unavailable();
        const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          if ((await file.stat()).size !== record.byteSize) throw unavailable();
          bytes = await file.readFile({ signal });
        } finally { await file.close(); }
      }
      if (bytes.length !== record.byteSize || hashOf(bytes) !== record.contentHash) throw unavailable();
      return bytes;
    },
  };
}

export function mediaStorage() {
  return createMediaStorage({ backend: process.env.FURTHER_DATA_BACKEND, localDir: process.env.FURTHER_LOCAL_DIR, bucket: process.env.FURTHER_MEDIA_BUCKET, region: process.env.AWS_REGION });
}
