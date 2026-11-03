import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { FurtherRepository, IndexItem, IndexStatus } from "../data/contracts";
import { EMBEDDING_MODEL, EMBEDDING_REVISION, EMBEDDING_SPACE } from "./space";
import { contextualSearchText, isShortSearchQuery } from "./projection";
export { EMBEDDING_MODEL, EMBEDDING_REVISION, EMBEDDING_SPACE } from "./space";

const response = z.object({ vectors: z.array(z.array(z.number().finite()).length(768)), model: z.literal(EMBEDDING_MODEL), revision: z.literal(EMBEDDING_REVISION), mode: z.literal("local-meta") });
function endpoint() {
  const url = new URL(process.env.FURTHER_EMBEDDING_URL ?? "http://127.0.0.1:8767");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.protocol !== "http:") throw new Error("Embeddings must remain on loopback.");
  return url.origin;
}
export async function embeddingHealth() {
  try { const r = await fetch(`${endpoint()}/health`, { signal: AbortSignal.timeout(1200), cache: "no-store" }); if (!r.ok) return { status: "unavailable" }; return await r.json(); }
  catch { return { status: "unavailable", model: EMBEDDING_MODEL, dimensions: 768 }; }
}
export async function embed(texts: string[], signal?: AbortSignal) {
  const token = process.env.FURTHER_EMBEDDING_TOKEN ?? (await readFile(resolve(".local/embedding-token"), "utf8")).trim();
  const r = await fetch(`${endpoint()}/embed`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ texts }), signal: AbortSignal.any([AbortSignal.timeout(45_000), ...(signal ? [signal] : [])]) });
  if (!r.ok) throw new Error("Local embeddings are unavailable.");
  const data = response.parse(await r.json());
  if (data.vectors.length !== texts.length) throw new Error("Embedding count mismatch.");
  return data;
}

/** Persist work before attempting inference. Identical sources do not re-embed. */
export function enqueueIndexText(repo: FurtherRepository, actorId: string, items: IndexItem[]) {
  return repo.enqueueIndexItems(actorId, items, EMBEDDING_SPACE);
}
export function reconcileIndex(repo: FurtherRepository, actorId: string) {
  return repo.reconcileIndex(actorId, EMBEDDING_SPACE);
}

export type Embedder = (texts: string[], signal?: AbortSignal) => Promise<{ vectors: number[][]; model: string; revision: string; mode: string }>;
/** A bounded worker pass. Persisted leases permit recovery after process loss. */
export async function processIndexJobs(repo: FurtherRepository, actorId: string, options: { signal?: AbortSignal; embedder?: Embedder; maxBatches?: number } = {}): Promise<IndexStatus> {
  const embedding = options.embedder ?? embed;
  for (let batch = 0; batch < Math.max(1,Math.min(options.maxBatches ?? 8,32)); batch++) {
    if (options.signal?.aborted) break;
    const jobs = await repo.claimIndexJobs(actorId, EMBEDDING_SPACE, 16);
    if (!jobs.length) break;
    try {
      const result = await embedding(jobs.map(job => job.text), options.signal);
      if (result.model !== EMBEDDING_MODEL || result.revision !== EMBEDDING_REVISION || result.mode !== "local-meta" || result.vectors.length !== jobs.length) throw new Error("Embedding space mismatch");
      for (let i = 0; i < jobs.length; i++) await repo.completeIndexJob(actorId,jobs[i].id,jobs[i].leaseToken!,result.vectors[i]);
    } catch {
      for (const job of jobs) await repo.failIndexJob(actorId,job.id,job.leaseToken!,"Local indexing is waiting for the embedding service.");
      break;
    }
  }
  return repo.getIndexStatus(actorId, EMBEDDING_SPACE);
}

// One worker per learner/repository in this process. The database lease remains
// authoritative, including after restart or when another worker claims expired work.
const running = new WeakMap<FurtherRepository, Map<string, Promise<IndexStatus>>>();
const retryTimers = new WeakMap<FurtherRepository, Map<string, ReturnType<typeof setTimeout>>>();
export function drainBackground(repo: FurtherRepository, actorId: string): Promise<IndexStatus> {
  let tasks = running.get(repo);
  if (!tasks) { tasks = new Map(); running.set(repo,tasks); }
  const existing = tasks.get(actorId);
  if (existing) return existing;
  const task = processIndexJobs(repo,actorId).then(status => {
    if (status.pending + status.retry + status.processing > 0) {
      let timers = retryTimers.get(repo);
      if (!timers) { timers = new Map(); retryTimers.set(repo,timers); }
      const old = timers.get(actorId); if (old) clearTimeout(old);
      const delay = Math.max(500,Math.min(60_000,(status.nextAttemptAt ?? Date.now()+500)-Date.now()));
      const timer = setTimeout(() => { timers!.delete(actorId); void drainBackground(repo,actorId).catch(()=>undefined); },delay);
      timer.unref?.(); timers.set(actorId,timer);
    }
    return status;
  }).finally(()=>tasks!.delete(actorId));
  tasks.set(actorId,task);
  return task;
}

/** Explicit synchronous repair endpoint; normal expansion uses the background pass. */
export async function indexText(repo: FurtherRepository, actorId: string, items: IndexItem[], signal?: AbortSignal) {
  await enqueueIndexText(repo,actorId,items);
  const status = await processIndexJobs(repo,actorId,{signal,maxBatches:32});
  if (status.retry) throw new Error("Local indexing is waiting for the embedding service.");
  return status;
}
export async function search(repo: FurtherRepository, actorId: string, text: string, signal?: AbortSignal) {
  let query = text;
  if (isShortSearchQuery(text)) {
    const [snapshot, runs] = await Promise.all([repo.getSnapshot(actorId), repo.getAgentRuns(actorId, 50)]);
    query = contextualSearchText(text, snapshot.concepts, runs);
  }
  const r = await embed([query],signal);
  return repo.searchVectors(actorId,r.vectors[0],{model:r.model,modelRevision:r.revision,limit:8});
}
