import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createAgentRuntime, FixtureAgentModel, INPUT_SCHEMAS, type AgentId, type AgentInput, type AgentResult, type AgentEvent } from "../agents";
import { createModelFromEnvironment } from "../agents/openai-provider";
import { getRepository } from "../data/repository";
import { learningEvidence } from "../agents/evidence";
import { drainBackground, reconcileIndex, search } from "../retrieval/client";
import { rankedPeers } from "./social";
import { errorResponse, HttpError } from "./http";
import type { Concept, Edge } from "../../lib/types";
import { KNOWLEDGE_OVERVIEW_PROMPT_VERSION, KNOWLEDGE_OVERVIEW_REQUEST } from "../../lib/knowledge-overview";
import { cachedKnowledgeOverviewRun, cacheKnowledgeOverviewRun, knowledgeOverviewSource } from "./knowledge-overview";

type Result<I extends AgentId> = AgentResult<I> & { persisted: boolean; indexWarning?: string };
type Options = { idempotencyKey?: string; signal?: AbortSignal; fixture?: boolean; onEvent?: (event:AgentEvent)=>void; overviewSourceHash?: string; overviewAttempt?: string;
  /** Trusted backend-only, owner-validated bounded map-reduce projection. Never accepted from HTTP input. */
  overviewProjection?: { concepts: Array<{ slug: string; title: string; hook: string }>; edges: Edge[] };
};
interface Subscriber { onEvent?: (event:AgentEvent)=>void }
interface PendingRun { fingerprint:string; promise:Promise<unknown>; controller:AbortController; subscribers:Set<Subscriber>; sequence:number; settled:boolean; streaming:boolean }
// Single local database process: coalesce concurrent retries before any model call.
const globalState = globalThis as typeof globalThis & { furtherAgentStreamingPending?: Map<string, PendingRun> };
const pending = globalState.furtherAgentStreamingPending ??= new Map();
export const modelMode = () => process.env.FURTHER_MODEL_MODE === "fixture" ? "fixture" : "live";
export function runKey(actor: string, agent: string, key: string) {
  const h = createHash("sha256").update(`${actor}:${agent}:${key}`).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
function storedInput(input: unknown) {
  const value = structuredClone(input) as Record<string, unknown>;
  if (typeof value.imageDataUrl === "string") {
    value.imageSha256 = createHash("sha256").update(value.imageDataUrl).digest("hex");
    delete value.imageDataUrl;
  }
  return value;
}

/** Transport independent use case. Actor authority is supplied by a trusted adapter. */
export async function invokeAgent<I extends AgentId>(actorId: string, agentId: I, input: AgentInput<I>, options: Options = {}): Promise<Result<I>> {
  let parsed = INPUT_SCHEMAS[agentId].parse(input);
  const demo = options.fixture === true;
  const mode = demo ? "fixture" : modelMode();
  const summarizing = agentId === "knowledge-map" && (parsed as {objective?:string}).objective === "summarize";
  let overview: ReturnType<typeof knowledgeOverviewSource> | undefined;
  if (summarizing) {
    const repo = await getRepository();
    overview = knowledgeOverviewSource(await repo.getSnapshot(actorId), options.overviewProjection);
    if (!overview.source.concepts.length) throw new HttpError(400,"Explore a question before creating your knowledge overview.");
    if (options.overviewSourceHash && options.overviewSourceHash !== overview.sourceHash) throw new HttpError(409,"Your map changed. Reload its overview before continuing.",{code:"STALE_KNOWLEDGE_OVERVIEW"});
    // Even independent generic invocation cannot send a raw question/profile as
    // summary context. The owner-authorized concept projection is the only source.
    parsed = {...parsed,text:KNOWLEDGE_OVERVIEW_REQUEST} as typeof parsed;
    if (!demo) {
      const cached = await cachedKnowledgeOverviewRun(repo,actorId,overview.sourceHash,mode,overview.source.concepts.map(concept=>concept.slug));
      if (cached) {
        if (options.signal?.aborted) throw new HttpError(499,"This request was cancelled.");
        if (knowledgeOverviewSource(await repo.getSnapshot(actorId), options.overviewProjection).graphHash !== overview.graphHash) throw new HttpError(409,"Your map changed. Reload its overview before continuing.",{code:"STALE_KNOWLEDGE_OVERVIEW"});
        options.onEvent?.({type:"activity",sequence:0,at:new Date().toISOString(),agentId,phase:"completed",label:"Restored your saved knowledge overview."});
        return cached as unknown as Result<I>;
      }
    }
  }
  const overviewAttempt = overview ? options.overviewAttempt ?? (options.idempotencyKey ? createHash("sha256").update(options.idempotencyKey).digest("hex") : "initial") : undefined;
  const logicalKey = overview ? `overview:${KNOWLEDGE_OVERVIEW_PROMPT_VERSION}:${overview.sourceHash}:${overviewAttempt}` : options.idempotencyKey ?? randomUUID();
  const runId = runKey(actorId, agentId, `${mode}:${demo?"demo":"persist"}:${logicalKey}`);
  const inputSource = {...storedInput(parsed),...(overview?{sourceHash:overview.sourceHash,summaryMode:mode}:{})};
  const savedInput = {...inputSource,...(overview?{overviewAttempt}:{})};
  const fingerprint = createHash("sha256").update(JSON.stringify(inputSource)).digest("hex");
  // Different tabs/retry keys for the same source share one in-flight model run.
  const pendingKey = overview ? runKey(actorId,agentId,`${mode}:${demo?"demo":"persist"}:overview-pending:${overview.sourceHash}`) : runId;
  const existing = pending.get(pendingKey);
  if (existing) {
    if(existing.fingerprint!==fingerprint)throw new HttpError(409,"Use a new request key when changing the input.");
    options.onEvent?.({type:"activity",sequence:0,at:new Date().toISOString(),agentId,phase:"waiting",label:"Connected to the request already in progress."});
    return subscribe(existing);
  }
  if(options.signal?.aborted)throw new HttpError(499,"This request was cancelled.");
  if(pending.size>=4)throw new HttpError(429,"The local assistant is busy with four requests. Try again shortly.");
  const entry:PendingRun={fingerprint,promise:Promise.resolve(),controller:new AbortController(),subscribers:new Set(),sequence:0,settled:false,streaming:!!options.onEvent};
  entry.promise=Promise.resolve().then(execute).finally(()=>{entry.settled=true;pending.delete(pendingKey);});
  pending.set(pendingKey,entry);
  return subscribe(entry);

  function subscribe(run:PendingRun):Promise<Result<I>> {
    return new Promise((resolve,reject)=>{
      const subscriber:Subscriber={onEvent:options.onEvent};
      const leave=()=>{run.subscribers.delete(subscriber);options.signal?.removeEventListener("abort",abort);};
      const abort=()=>{leave();if(!run.settled&&!run.subscribers.size)run.controller.abort();reject(new HttpError(499,"This request was cancelled."));};
      run.subscribers.add(subscriber);
      if(options.signal?.aborted){abort();return;}
      options.signal?.addEventListener("abort",abort,{once:true});
      run.promise.then(value=>{leave();resolve(value as Result<I>);},error=>{leave();reject(error);});
    });
  }
  function emit(event:AgentEvent) {
    const next={...event,sequence:++entry.sequence};
    for(const subscriber of entry.subscribers)try{subscriber.onEvent?.(next);}catch{/* A disconnected observer cannot fail shared inference. */}
  }
  function activity(phase:Extract<AgentEvent,{type:"activity"}>["phase"],label:string){emit({type:"activity",sequence:0,at:new Date().toISOString(),agentId,phase,label});}

  async function execute(): Promise<Result<I>> {
    const repo = await getRepository();
    if (!demo) {
      const previous = await repo.getAgentRun(actorId, runId);
      if (previous) {
        if (previous.input.fingerprint !== fingerprint) throw new HttpError(409,"Use a new request key when changing the input.");
        if (previous.status === "succeeded" && previous.output) {
          if (overview) {
            if (knowledgeOverviewSource(await repo.getSnapshot(actorId), options.overviewProjection).graphHash !== overview.graphHash) throw new HttpError(409,"Your map changed. Reload its overview before continuing.",{code:"STALE_KNOWLEDGE_OVERVIEW"});
            await cacheKnowledgeOverviewRun(repo,actorId,overview.sourceHash,previous.output as unknown as Result<"knowledge-map">,overview.source.concepts.map(concept=>concept.slug));
          }
          activity("completed","Restored your saved result.");return previous.output as unknown as Result<I>;
        }
        if (previous.status === "failed" && previous.output?.retryWithNewKey === true) throw new HttpError(409, "That attempt could not finish. Retry to start a new attempt.", { code: "AGENT_ATTEMPT_FAILED", retryWithNewKey: true });
        throw new HttpError(409, previous.status === "running" ? "This request may still be finishing. Retry shortly to recover its saved result." : "That attempt stopped while saving. Reload to check your saved progress before starting again.", { code: "AGENT_OUTCOME_UNKNOWN" });
      }
      const recent=await repo.getAgentRuns(actorId,100);
      if(recent.filter(r=>r.createdAt>Date.now()-600_000).length>=40)throw new HttpError(429,"Too many assistant requests in ten minutes. Try again shortly.");
      let overviewAttemptNumber: number | undefined;
      if (overview) {
        const latest=await repo.getLatestKnowledgeOverviewRun(actorId,overview.sourceHash,mode);
        if (latest?.status === "running" || (latest?.status === "failed" && latest.output?.retryWithNewKey !== true)) {
          throw new HttpError(409,"A previous overview attempt may still be finishing. Reload to recover its saved result before starting another.",{code:"AGENT_OUTCOME_UNKNOWN"});
        }
        if (latest?.status === "succeeded" && latest.output) {
          if (knowledgeOverviewSource(await repo.getSnapshot(actorId), options.overviewProjection).graphHash !== overview.graphHash) throw new HttpError(409,"Your map changed. Reload its overview before continuing.",{code:"STALE_KNOWLEDGE_OVERVIEW"});
          await cacheKnowledgeOverviewRun(repo,actorId,overview.sourceHash,latest.output as unknown as Result<"knowledge-map">,overview.source.concepts.map(concept=>concept.slug));
          activity("completed","Restored your saved knowledge overview.");
          return latest.output as unknown as Result<I>;
        }
        overviewAttemptNumber=Number(latest?.input.overviewAttemptNumber ?? 0)+1;
      }
      await repo.beginAgentRun({id:runId,actorId,agentId,input:{fingerprint,...savedInput,...(overview?{overviewAttemptNumber}:{})}});
    }
    let persistenceStarted = false;
    try {
      const runtime = createAgentRuntime({ mode, model: mode === "fixture" ? new FixtureAgentModel() : createModelFromEnvironment(), tools: {
        getMap: async () => {
          if (overview) return overview.source;
          const s = await repo.getSnapshot(actorId);
          // Private learning overlay is visible only to its owner's assistant.
          return { concepts:s.concepts.slice(-100), edges:s.edges.slice(-200), intent:s.profile.currentIntent, evidence:learningEvidence(s.concepts,s.events), metadata:s.metadata.slice(0,5).map(m=>({kind:m.kind,values:m.values,confirmed:m.provenance.confirmed===true})) };
        },
        findPeers: async ({limit,query}) => {
          return (await rankedPeers(repo,actorId,undefined,query)).filter(r=>r.score>0).slice(0,limit).map(r=>({id:r.peer.id,displayName:r.peer.name,reason:r.topicPairs[0]?`Your ${r.topicPairs[0].ownTopic.title} connects with ${r.topicPairs[0].peerTopic.title}. Available for ${r.commonMinutes} minutes together.`:"Related ideas and available now",sharedConcepts:[...new Set(r.topicPairs.map(pair=>pair.ownTopic.slug))],complementaryConcepts:r.teach?[r.teach.slug]:[],score:r.score}));
        },
        getLearningContext: async (concept,ctx) => {
          const s=await repo.getSnapshot(actorId);
          let relevant:unknown[]=[]; let retrieval="unavailable";
          try { relevant=await search(repo,actorId,concept,ctx.signal); retrieval="local-meta"; } catch { /* Explicit status; learning does not require the derived index. */ }
          const selected=s.concepts.find(c=>c.slug===concept||c.title===concept);
          const previousLessons=(await repo.getAgentRuns(actorId,30)).filter(run=>run.agentId==="learning-companion"&&run.status==="succeeded"&&run.output?.mode===mode&&run.input.mode==="solo"&&(run.input.concept===concept||run.input.concept===selected?.slug)).slice(0,2).flatMap(run=>{
            const data=run.output?.data as Record<string,unknown>|undefined;
            return data&&typeof data.body==="string"?[{title:data.title,body:data.body.slice(0,3000),at:new Date(run.createdAt).toISOString(),source:"previous AI lesson, not independently verified"}]:[];
          });
          return {concept:selected,evidence:learningEvidence(selected?[selected]:[],s.events),preferences:s.profile.preferences,previousLessons,relevant,retrieval};
        },
      }});
      const raw = await runtime.invoke(agentId, parsed as AgentInput<I>, {actorId,correlationId:runId,signal:entry.controller.signal,onEvent:entry.streaming?emit:undefined,...(overview?{budget:{maxOutputTokens:12_000}}:{})});
      const result:Result<I> = {...raw,runId,persisted:false};
      if (!demo) {
        if (overview && knowledgeOverviewSource(await repo.getSnapshot(actorId), options.overviewProjection).graphHash !== overview.graphHash) throw new HttpError(409,"Your map changed while its overview was being prepared. Reload to use the current map.",{code:"STALE_KNOWLEDGE_OVERVIEW"});
        activity("saving","Saving the validated result.");
        persistenceStarted = true;
        for (const artifact of [...raw.artifacts, {agentId:raw.agentId,data:raw.data,provider:raw.provider,model:raw.model}]) {
          if (artifact.agentId !== "metadata") continue;
          if (agentId === "knowledge-map" && (parsed as {objective:string}).objective !== "expand") continue;
          await repo.saveMetadata(actorId,"intent-proposal",artifact.data as Record<string,unknown>,{source:"agent",model:artifact.model,runId,confirmed:false,schemaVersion:1});
        }
        if (agentId === "knowledge-map" && (parsed as {objective:string}).objective === "expand") {
          const data=result.data as AgentResult<"knowledge-map">["data"];
          const globalConcepts=await repo.getConcepts();
          const byTitle=new Map(globalConcepts.map(c=>[c.title.toLowerCase().trim(),c]));
          const aliases=new Map(data.concepts.map(c=>[c.slug,byTitle.get(c.title.toLowerCase().trim())?.slug??c.slug]));
          data.concepts=data.concepts.map(c=>({...c,slug:aliases.get(c.slug)!,edge:c.edge?{...c.edge,from:aliases.get(c.edge.from)??c.edge.from}:undefined}));
          data.root=aliases.get(data.root)??data.concepts[0]?.slug??data.root;
          const concepts:Concept[]=data.concepts.map(c=>({...c,domain:"general",difficulty:Math.max(1,Math.round(c.difficulty*4+1))}));
          const edges:Edge[]=data.concepts.flatMap(c=>c.edge?[{src:c.edge.from,dst:c.slug,kind:c.edge.kind}]:[]);
          await repo.addConcepts(actorId,concepts,edges);
          // Intent is what the learner just explicitly asked; inferred traits stay proposals.
          await repo.updateProfile(actorId,{currentIntent:String((parsed as {text:string}).text).slice(0,500)});
          activity("indexing","Your map is saved. Queuing changed ideas for semantic search.");
          // Source writes already enqueue atomically. Reconciliation also repairs
          // older maps; paid inference completion never waits for the encoder.
          const indexing = await reconcileIndex(repo,actorId);
          if (indexing.pending + indexing.processing + indexing.retry > 0) result.indexWarning="Your map is saved. Related ideas are being indexed in the background.";
          void drainBackground(repo,actorId).catch(()=>undefined);
        }
        result.persisted=true;
        if (overview) await cacheKnowledgeOverviewRun(repo,actorId,overview.sourceHash,result as unknown as Result<"knowledge-map">,overview.source.concepts.map(concept=>concept.slug));
        await repo.finishAgentRun(actorId,runId,{output:result as unknown as Record<string,unknown>,model:result.model,provider:result.provider});
        activity("completed","Result saved.");
      }
      return result;
    } catch (error) {
      // A new key is safe only when no result mutation was attempted, and that
      // terminal state is durable. A lost response/partial save keeps its old key.
      let failureRecorded = false;
      if (!demo) {
        try {
          await repo.finishAgentRun(actorId,runId,{error:error instanceof HttpError?error.message:"Agent request failed; see the safe error code in the response.",output:{retryWithNewKey:!persistenceStarted}});
          failureRecorded = true;
        } catch { /* The outcome is unknown; never authorize a duplicate mutation. */ }
      }
      if (!persistenceStarted && (demo || failureRecorded)) {
        const safeResponse = errorResponse(error), safe = await safeResponse.json() as { error: string; code?: string };
        throw new HttpError(safeResponse.status, safe.error, { code: safe.code, retryWithNewKey: true });
      }
      throw error;
    }
  }
}
