import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createAgentRuntime, FixtureAgentModel, INPUT_SCHEMAS, type AgentId, type AgentInput, type AgentResult, type AgentEvent } from "../agents";
import { createModelFromEnvironment } from "../agents/openai-provider";
import { getRepository } from "../data/repository";
import { learnerModel } from "../../lib/learn";
import { indexText, search } from "../retrieval/client";
import { rankedPeers } from "./social";
import { HttpError } from "./http";
import type { Concept, Edge } from "../../lib/types";

type Result<I extends AgentId> = AgentResult<I> & { persisted: boolean; indexWarning?: string };
type Options = { idempotencyKey?: string; signal?: AbortSignal; fixture?: boolean; onEvent?: (event:AgentEvent)=>void };
interface Subscriber { onEvent?: (event:AgentEvent)=>void }
interface PendingRun { fingerprint:string; promise:Promise<unknown>; controller:AbortController; subscribers:Set<Subscriber>; sequence:number; settled:boolean; streaming:boolean }
// Single local database process: coalesce concurrent retries before any model call.
const globalState = globalThis as typeof globalThis & { furtherAgentStreamingPending?: Map<string, PendingRun> };
const pending = globalState.furtherAgentStreamingPending ??= new Map();
export const modelMode = () => process.env.FURTHER_MODEL_MODE === "fixture" ? "fixture" : "live";
function runKey(actor: string, agent: string, key: string) {
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
  const parsed = INPUT_SCHEMAS[agentId].parse(input);
  const demo = options.fixture === true;
  const mode = demo ? "fixture" : modelMode();
  const runId = runKey(actorId, agentId, `${mode}:${demo?"demo":"persist"}:${options.idempotencyKey ?? randomUUID()}`);
  const fingerprint = createHash("sha256").update(JSON.stringify(storedInput(parsed))).digest("hex");
  const existing = pending.get(runId);
  if (existing) {
    if(existing.fingerprint!==fingerprint)throw new HttpError(409,"Use a new request key when changing the input.");
    options.onEvent?.({type:"activity",sequence:0,at:new Date().toISOString(),agentId,phase:"waiting",label:"Connected to the request already in progress."});
    return subscribe(existing);
  }
  if(options.signal?.aborted)throw new HttpError(499,"This request was cancelled.");
  if(pending.size>=4)throw new HttpError(429,"The local assistant is busy with four requests. Try again shortly.");
  const entry:PendingRun={fingerprint,promise:Promise.resolve(),controller:new AbortController(),subscribers:new Set(),sequence:0,settled:false,streaming:!!options.onEvent};
  entry.promise=Promise.resolve().then(execute).finally(()=>{entry.settled=true;pending.delete(runId);});
  pending.set(runId,entry);
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
        if (previous.status === "succeeded" && previous.output) {activity("completed","Restored your saved result.");return previous.output as unknown as Result<I>;}
        throw new HttpError(409, previous.status === "running" ? "This request is already running or was interrupted. Retry with a new request key." : "That attempt failed. Retry with a new request key.");
      }
      const recent=await repo.getAgentRuns(actorId,100);
      if(recent.filter(r=>r.createdAt>Date.now()-600_000).length>=40)throw new HttpError(429,"Too many assistant requests in ten minutes. Try again shortly.");
      await repo.beginAgentRun({id:runId,actorId,agentId,input:{fingerprint,...storedInput(parsed)}});
    }
    try {
      const runtime = createAgentRuntime({ mode, model: mode === "fixture" ? new FixtureAgentModel() : createModelFromEnvironment(), tools: {
        getMap: async () => {
          const s = await repo.getSnapshot(actorId);
          // Private learning overlay is visible only to its owner's assistant.
          return { concepts:s.concepts.slice(-100), edges:s.edges.slice(-200), nodes:Object.fromEntries(s.concepts.slice(-100).map(c=>[c.slug,s.nodes[c.slug]])), intent:s.profile.currentIntent, learner:{summary:learnerModel(s.nodes,s.events).summary.slice(0,3000)}, metadata:s.metadata.slice(0,5) };
        },
        findPeers: async ({limit}) => {
          const s=await repo.getSnapshot(actorId);
          return (await rankedPeers(repo,actorId)).filter(r=>r.score>0).slice(0,limit).map(r=>({id:r.peer.id,displayName:r.peer.name,reason:r.teach?`Complementary knowledge around ${r.teach.slug.replaceAll("-"," ")}`:"Shared interests and available now",sharedConcepts:r.peer.activeConcepts.filter(slug=>!!s.nodes[slug]),complementaryConcepts:r.teach?[r.teach.slug]:[],score:r.score}));
        },
        getLearningContext: async (concept,ctx) => {
          const s=await repo.getSnapshot(actorId);
          let relevant:unknown[]=[]; let retrieval="unavailable";
          try { relevant=await search(repo,actorId,concept,ctx.signal); retrieval="local-meta"; } catch { /* Explicit status; learning does not require the derived index. */ }
          return {concept:s.concepts.find(c=>c.slug===concept||c.title===concept),learner:{summary:learnerModel(s.nodes,s.events).summary.slice(0,3000)},preferences:s.profile.preferences,relevant,retrieval};
        },
      }});
      const raw = await runtime.invoke(agentId, parsed as AgentInput<I>, {actorId,correlationId:runId,signal:entry.controller.signal,onEvent:entry.streaming?emit:undefined});
      const result:Result<I> = {...raw,runId,persisted:false};
      if (!demo) {
        activity("saving","Saving the validated result.");
        for (const artifact of [...raw.artifacts, {agentId:raw.agentId,data:raw.data,provider:raw.provider,model:raw.model}]) {
          if (artifact.agentId !== "metadata") continue;
          await repo.saveMetadata(actorId,"intent-proposal",artifact.data as Record<string,unknown>,{source:"agent",model:artifact.model,runId,confirmed:false,schemaVersion:1});
        }
        if (agentId === "knowledge-map") {
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
          activity("indexing","Indexing your saved map for related learning.");
          try { await indexText(repo,actorId,[...concepts.map(c=>({entityType:"concept" as const,entityId:c.slug,text:`${c.title}. ${c.hook}`})),{entityType:"intent",entityId:"current",text:data.intent}],entry.controller.signal); }
          catch { result.indexWarning="Map saved. Local semantic search is not indexed yet; start embeddings and rebuild the index."; }
        }
        result.persisted=true;
        await repo.finishAgentRun(actorId,runId,{output:result as unknown as Record<string,unknown>,model:result.model,provider:result.provider});
        activity("completed","Result saved.");
      }
      return result;
    } catch (error) {
      if (!demo) await repo.finishAgentRun(actorId,runId,{error:error instanceof HttpError?error.message:"Agent request failed; see the safe error code in the response."}).catch(()=>undefined);
      throw error;
    }
  }
}
