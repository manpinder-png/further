import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AgentEvent, AgentResult } from "../agents/contracts";
import { KnowledgeOverviewSourceSchema, KnowledgeMapOutput, validateKnowledgeOverviewGroups } from "../agents/contracts";
import type { FurtherRepository, Snapshot } from "../data/contracts";
import { getRepository } from "../data/repository";
import { KNOWLEDGE_OVERVIEW_PROMPT_VERSION, KNOWLEDGE_OVERVIEW_REQUEST, type KnowledgeOverviewGroup, type KnowledgeOverviewMode, type KnowledgeOverviewRequest, type KnowledgeOverviewResult, type KnowledgeOverviewSnapshot } from "../../lib/knowledge-overview";
import { HttpError } from "./http";

const ScopeSchema = z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80)).min(1).max(10_000);
export const KnowledgeOverviewScopeSchema = z.object({ conceptSlugs: ScopeSchema.optional() }).strict();
export const KnowledgeOverviewRequestSchema = z.object({ sourceHash: z.string().regex(/^[a-f0-9]{64}$/), attempt: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).optional(), conceptSlugs: ScopeSchema.optional() }).strict();
const MAX_SOURCE_BYTES = 160_000;
const BATCH_SIZE = 120;
type SummaryResult = AgentResult<"knowledge-map"> & { persisted: boolean };
export type KnowledgeOverviewProjection = z.infer<typeof KnowledgeOverviewSourceSchema>;
type SourceSnapshot = Pick<Snapshot, "concepts" | "edges">;

function normalized(snapshot: SourceSnapshot) {
  const concepts = snapshot.concepts.map(({ slug, title, hook }) => ({ slug, title, hook })).sort((a, b) => a.slug.localeCompare(b.slug));
  const own = new Set(concepts.map(concept => concept.slug));
  if (own.size !== concepts.length || snapshot.edges.some(edge => !own.has(edge.src) || !own.has(edge.dst))) throw new HttpError(409, "Your knowledge map could not be read consistently. Reload before creating its overview.");
  const edges = snapshot.edges.map(({ src, dst, kind }) => ({ src, dst, kind })).sort((a, b) => `${a.src}:${a.dst}:${a.kind}`.localeCompare(`${b.src}:${b.dst}:${b.kind}`));
  return { concepts, edges };
}
function sourceHash(source: KnowledgeOverviewProjection) { return createHash("sha256").update(`${KNOWLEDGE_OVERVIEW_PROMPT_VERSION}\n${JSON.stringify(source)}`).digest("hex"); }
/** Complete graph signature has no model-context size ceiling. Only bounded projections enter inference. */
export function knowledgeGraphSignature(snapshot: SourceSnapshot) { return sourceHash(normalized(snapshot)); }

/** Trusted backend projections may summarize children, but every representative ID must be owned. */
export function knowledgeOverviewSource(snapshot: SourceSnapshot, projection?: KnowledgeOverviewProjection) {
  const complete = normalized(snapshot), own = new Set(complete.concepts.map(concept => concept.slug));
  const selected = projection ?? complete;
  if (selected.concepts.length > 200 || selected.edges.length > 800) throw new HttpError(413, "This branch is too large for one overview. The per-request limit is 200 concepts and 800 connections; use the bounded hierarchy builder.");
  const source = KnowledgeOverviewSourceSchema.parse({ concepts: [...selected.concepts].sort((a,b) => a.slug.localeCompare(b.slug)), edges: [...selected.edges].sort((a,b) => `${a.src}:${a.dst}:${a.kind}`.localeCompare(`${b.src}:${b.dst}:${b.kind}`)) });
  const ids = new Set(source.concepts.map(concept => concept.slug));
  if (ids.size !== source.concepts.length || [...ids].some(slug => !own.has(slug)) || source.edges.some(edge => !ids.has(edge.src) || !ids.has(edge.dst))) throw new HttpError(403, "Only concepts in your saved map can be organized.");
  if (Buffer.byteLength(JSON.stringify(source)) > MAX_SOURCE_BYTES) throw new HttpError(413, "This branch contains too much text for one overview. Nothing was shortened or sent to the model.");
  return { sourceHash: sourceHash(source), source, graphHash: sourceHash(complete) };
}
function scoped(snapshot: SourceSnapshot, conceptSlugs?: string[]): SourceSnapshot {
  if (!conceptSlugs) return snapshot;
  const requested = new Set(ScopeSchema.parse(conceptSlugs)), own = new Set(snapshot.concepts.map(concept => concept.slug));
  if ([...requested].some(slug => !own.has(slug))) throw new HttpError(403, "Choose a topic from your own saved map.");
  return { concepts: snapshot.concepts.filter(concept => requested.has(concept.slug)), edges: snapshot.edges.filter(edge => requested.has(edge.src) && requested.has(edge.dst)) };
}

async function cacheId(actorId: string, hash: string, mode: KnowledgeOverviewMode) {
  const { runKey } = await import("./agents");
  return runKey(actorId, "knowledge-map", `overview-cache:${mode}:${KNOWLEDGE_OVERVIEW_PROMPT_VERSION}:${hash}`);
}

/** Direct keyed lookup, independent of activity/history pagination. */
export async function cachedKnowledgeOverviewRun(repo: FurtherRepository, actorId: string, hash: string, mode: KnowledgeOverviewMode, conceptSlugs: string[]): Promise<SummaryResult | null> {
  const saved = await repo.getAgentRun(actorId, await cacheId(actorId, hash, mode));
  if (!saved || saved.status !== "succeeded" || saved.input.sourceHash !== hash || saved.input.promptVersion !== KNOWLEDGE_OVERVIEW_PROMPT_VERSION || saved.input.mode !== mode) return null;
  const result = saved.output as unknown as SummaryResult | undefined;
  if (!result || result.agentId !== "knowledge-map" || result.mode !== mode || !result.persisted) return null;
  const output = KnowledgeMapOutput.safeParse(result.data);
  if (!output.success) return null;
  try { validateKnowledgeOverviewGroups(output.data.groups, conceptSlugs); } catch { return null; }
  return { ...result, data: output.data };
}
export async function cacheKnowledgeOverviewRun(repo: FurtherRepository, actorId: string, hash: string, result: SummaryResult, conceptSlugs: string[]) {
  validateKnowledgeOverviewGroups(result.data.groups, conceptSlugs);
  const id = await cacheId(actorId, hash, result.mode);
  const existing = await repo.getAgentRun(actorId,id);
  if (existing?.status === "succeeded") return;
  if (!existing) await repo.beginAgentRun({ id, actorId, agentId: "knowledge-map", input: { objective: "summarize", derivedCache: true, sourceHash: hash, promptVersion: KNOWLEDGE_OVERVIEW_PROMPT_VERSION, mode: result.mode } });
  await repo.finishAgentRun(actorId, id, { output: result as unknown as Record<string, unknown>, model: result.model, provider: result.provider });
}

function hierarchyCacheKey(actor: string, hash: string, mode: KnowledgeOverviewMode) { return cacheId(actor, `hierarchy:${hash}`, mode); }
function uniqueGroup(group: KnowledgeOverviewGroup): KnowledgeOverviewGroup {
  const suffix = createHash("sha256").update([...group.conceptSlugs].sort().join("\n")).digest("hex").slice(0,10);
  return { ...group, id: `${group.id.slice(0,65)}-${suffix}` };
}
function validateTree(groups: KnowledgeOverviewGroup[], slugs: string[]) {
  const pending: Array<{ groups: KnowledgeOverviewGroup[]; slugs: string[] }> = [{ groups, slugs }];
  while (pending.length) {
    const item = pending.pop()!;
    if (item.groups.length <= 12) validateKnowledgeOverviewGroups(item.groups, item.slugs);
    else {
      const assigned = item.groups.flatMap(group => group.conceptSlugs), expected = new Set(item.slugs);
      if (new Set(item.groups.map(group => group.id)).size !== item.groups.length || assigned.length !== expected.size || new Set(assigned).size !== assigned.length || assigned.some(slug => !expected.has(slug))) throw new Error("Invalid child coverage.");
    }
    for (const group of item.groups) if (group.children?.length) {
      if (group.children.some(child => child.conceptSlugs.length >= group.conceptSlugs.length)) throw new Error("A child topic must narrow its parent.");
      pending.push({ groups: group.children, slugs: group.conceptSlugs });
    }
  }
}
async function readHierarchy(repo: FurtherRepository, actor: string, hash: string, mode: KnowledgeOverviewMode, slugs: string[]) {
  const saved = await repo.getAgentRun(actor, await hierarchyCacheKey(actor, hash, mode));
  if (saved?.status !== "succeeded" || saved.input.mode !== mode || saved.input.sourceHash !== hash) return null;
  const output = saved.output as unknown as KnowledgeOverviewResult;
  if (!output?.overview || output.mode !== mode || output.sourceHash !== hash) return null;
  try { validateTree(output.overview.groups, slugs); } catch { return null; }
  return output;
}

export async function getKnowledgeOverview(repo: FurtherRepository, actorId: string, requestedMode?: KnowledgeOverviewMode, conceptSlugs?: string[]): Promise<KnowledgeOverviewSnapshot> {
  const { modelMode } = await import("./agents");
  const mode = requestedMode ?? modelMode(), snapshot = scoped(await repo.getSnapshot(actorId), conceptSlugs);
  const hash = knowledgeGraphSignature(snapshot), slugs = snapshot.concepts.map(concept => concept.slug);
  if (!slugs.length) return { sourceHash: hash, status: "empty" };
  const hierarchy = await readHierarchy(repo, actorId, hash, mode, slugs);
  if (hierarchy) return { sourceHash: hash, status: "ready", overview: hierarchy.overview, runId: hierarchy.runId, mode };
  const saved = snapshot.concepts.length <= 200 ? await cachedKnowledgeOverviewRun(repo,actorId,hash,mode,slugs) : null;
  if (!saved) {
    const latest = await repo.getLatestKnowledgeOverviewRun(actorId,hash,mode);
    const attempt = typeof latest?.input.overviewAttempt === "string" ? latest.input.overviewAttempt : undefined;
    return { sourceHash: hash, status: "missing", ...(attempt ? {attempt} : {}), ...(latest?.status === "running" || latest?.status === "failed" ? {requestStatus:latest.status} : {}), ...(latest?.status === "failed" && latest.output?.retryWithNewKey === true ? {retryWithNewKey:true} : {}) };
  }
  return { sourceHash: hash, status: "ready", overview: { groups: saved.data.groups, explanation: saved.data.explanation }, runId: saved.runId, mode: saved.mode };
}

/** Size-aware chunks preserve every concept; text is not silently truncated. */
export function overviewBatches(snapshot: SourceSnapshot): KnowledgeOverviewProjection[] {
  const complete = normalized(snapshot), batches: KnowledgeOverviewProjection[] = [];
  let concepts: KnowledgeOverviewProjection["concepts"] = [];
  const flush = () => {
    if (!concepts.length) return;
    const own = new Set(concepts.map(concept => concept.slug));
    const internal = complete.edges.filter(edge => own.has(edge.src) && own.has(edge.dst));
    batches.push({ concepts, edges: internal }); concepts = [];
  };
  for (const concept of complete.concepts) {
    if (Buffer.byteLength(JSON.stringify(concept)) > MAX_SOURCE_BYTES - 2000) throw new HttpError(413, "One saved concept is too large to summarize. Edit its description before continuing.");
    const proposed = new Set([...concepts.map(item => item.slug), concept.slug]);
    const edgeCount = complete.edges.filter(edge => proposed.has(edge.src) && proposed.has(edge.dst)).length;
    if (concepts.length >= BATCH_SIZE || edgeCount > 800 || Buffer.byteLength(JSON.stringify([...concepts, concept])) > 100_000) flush();
    concepts.push(concept);
  }
  flush(); return batches;
}

export async function generateKnowledgeOverview(actorId: string, input: KnowledgeOverviewRequest, options: { signal?: AbortSignal; onEvent?: (event: AgentEvent) => void } = {}): Promise<KnowledgeOverviewResult> {
  KnowledgeOverviewRequestSchema.parse(input);
  const repo = await getRepository(), full = await repo.getSnapshot(actorId), snapshot = scoped(full, input.conceptSlugs);
  const hash = knowledgeGraphSignature(snapshot), graphHash = knowledgeGraphSignature(full);
  if (hash !== input.sourceHash) throw new HttpError(409, "Your map changed. Reload its overview before continuing.", { code: "STALE_KNOWLEDGE_OVERVIEW" });
  if (!snapshot.concepts.length) throw new HttpError(400, "Explore a question before creating your knowledge overview.");
  const { invokeAgent, modelMode } = await import("./agents");
  const mode = modelMode(), cached = await readHierarchy(repo,actorId,hash,mode,snapshot.concepts.map(concept => concept.slug));
  if (cached) return cached;
  const ensureCurrent = async () => {
    if (options.signal?.aborted) throw new HttpError(499, "Overview paused.");
    if (knowledgeGraphSignature(await repo.getSnapshot(actorId)) !== graphHash) throw new HttpError(409, "Your map changed while its overview was being prepared. Reload to use the current map.", { code: "STALE_KNOWLEDGE_OVERVIEW" });
  };
  const summarize = async (projection: KnowledgeOverviewProjection) => {
    await ensureCurrent();
    const bounded = knowledgeOverviewSource(full, projection);
    const result = await invokeAgent(actorId, "knowledge-map", { objective: "summarize", text: KNOWLEDGE_OVERVIEW_REQUEST }, {
      ...options, overviewProjection: projection, overviewSourceHash: bounded.sourceHash, overviewAttempt: input.attempt ?? "initial",
      idempotencyKey: `overview:${KNOWLEDGE_OVERVIEW_PROMPT_VERSION}:${bounded.sourceHash}:${input.attempt ?? "initial"}`,
    });
    await ensureCurrent();
    return result;
  };
  const batches = overviewBatches(snapshot);
  if (batches.length === 1 && snapshot.edges.length <= 800) {
    const result = await summarize({ concepts: batches[0].concepts, edges: snapshot.edges });
    return { sourceHash: hash, overview: { groups: result.data.groups, explanation: result.data.explanation }, runId: result.runId, mode: result.mode };
  }
  // Map-reduce uses canonical representative IDs with read-only child summaries.
  // Each reduction must shrink; no arbitrary depth or whole-map model request.
  let groups: KnowledgeOverviewGroup[] = [];
  let lastRunId = "", lastModel = "", lastProvider = "";
  for (const batch of batches) {
    const result = await summarize(batch);
    lastRunId = result.runId; lastModel = result.model; lastProvider = result.provider;
    groups.push(...result.data.groups.map(uniqueGroup));
  }
  while (groups.length > 12) {
    const next: KnowledgeOverviewGroup[] = [];
    for (let offset = 0; offset < groups.length; offset += BATCH_SIZE) {
      const children = groups.slice(offset, offset+BATCH_SIZE);
      if (children.length === 1) { next.push(children[0]); continue; }
      const representatives = new Map(children.map(group => [group.conceptSlugs[0],group]));
      const projection = { concepts: [...representatives].map(([slug,group]) => ({slug,title:group.title,hook:group.summary})), edges: [] };
      const result = await summarize(projection);
      lastRunId = result.runId; lastModel = result.model; lastProvider = result.provider;
      for (const parent of result.data.groups) {
        const members = parent.conceptSlugs.map(slug => representatives.get(slug)!);
        next.push(uniqueGroup({ ...parent, conceptSlugs: members.flatMap(group => group.conceptSlugs), ...(members.length > 1 ? {children:members} : {children:members[0].children}) }));
      }
    }
    if (next.length >= groups.length) throw new HttpError(422,"The guide did not narrow these topics. Your map is saved; retry its overview.");
    groups = next;
  }
  validateTree(groups,snapshot.concepts.map(concept => concept.slug));
  const id = await hierarchyCacheKey(actorId,hash,mode);
  const output: KnowledgeOverviewResult = { sourceHash:hash,overview:{groups,explanation:"Your saved ideas are organized into topics. Open a topic to see its subtopics and original concepts."},runId:id,mode };
  await ensureCurrent();
  const existing = await repo.getAgentRun(actorId,id);
  if (!existing) await repo.beginAgentRun({id,actorId,agentId:"knowledge-hierarchy",input:{sourceHash:hash,mode,promptVersion:KNOWLEDGE_OVERVIEW_PROMPT_VERSION,objective:"summarize",lastRunId}});
  await repo.finishAgentRun(actorId,id,{output:output as unknown as Record<string,unknown>,model:lastModel,provider:lastProvider});
  return output;
}
