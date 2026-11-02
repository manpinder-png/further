/** Synthetic geometry for repository tests only; never used by application code. */
import { createHash } from "node:crypto";
import type { FurtherRepository } from "../../domains/data/contracts";
import { EMBEDDING_MODEL, EMBEDDING_REVISION } from "../../domains/retrieval/client";

export function unitVector(axis = 0, secondary = 0): number[] {
  const vector = Array<number>(768).fill(0);
  vector[axis] = 1;
  if (secondary) vector[(axis + 1) % 768] = secondary;
  const norm = Math.hypot(...vector);
  return vector.map(value => value / norm);
}

export async function seedSemanticIndex(repo: FurtherRepository, actorId: string, vectors: Record<string, number[]> = {}) {
  const space = { model: EMBEDDING_MODEL, modelRevision: EMBEDDING_REVISION };
  await repo.reconcileIndex(actorId, space);
  for (;;) {
    const jobs = await repo.claimIndexJobs(actorId, space);
    if (!jobs.length) break;
    for (const job of jobs) {
      const axis = createHash("sha256").update(job.entityId).digest().readUInt16BE() % 768;
      await repo.completeIndexJob(actorId, job.id, job.leaseToken!, vectors[job.entityId] ?? unitVector(axis));
    }
  }
}
