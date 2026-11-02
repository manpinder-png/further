import { handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { currentMatch } from "@/domains/backend/social";
import { KnowledgeMapOutput } from "@/domains/agents/contracts";
import { reconcileIndex, drainBackground } from "@/domains/retrieval/client";
export const dynamic="force-dynamic";
export async function GET(req:Request) {return handle(req,async()=>{
  const actor=await requireActor(req),repo=await getRepository(),snapshot=await repo.getSnapshot(actor),match=await currentMatch(repo,actor);
  const indexing=await reconcileIndex(repo,actor);
  void drainBackground(repo,actor).catch(()=>undefined);
  const missions=(await repo.getAgentRuns(actor,100)).filter(run=>run.agentId==="knowledge-map"&&(run.input.objective??"expand")==="expand").map(run=>{
    const parsed=KnowledgeMapOutput.safeParse(run.output?.data),data=parsed.success?parsed.data:null;
    return {id:parseInt(run.id.replaceAll("-","").slice(0,12),16),runId:run.id,text:typeof run.input.text==="string"?run.input.text:"Learning question",source:"agent",at:run.createdAt,status:run.status==="succeeded"?"done":run.status==="failed"?"error":"running",intent:data?.intent,error:run.error,added:data?.concepts.length??0,reused:0,slugs:data?.concepts.map(c=>c.slug)??[]};
  });
  return json({...snapshot,indexing,missions,modelMode:process.env.FURTHER_MODEL_MODE==="fixture"?"fixture":"live",explorers:await repo.listCandidates(actor),match,currentSessionId:match?.sessionId??null});
});}
