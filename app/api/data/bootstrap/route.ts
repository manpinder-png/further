import { handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { currentMatch } from "@/domains/backend/social";
import { missionsFromRuns } from "@/domains/backend/missions";
import { reconcileIndex, drainBackground } from "@/domains/retrieval/client";
export const dynamic="force-dynamic";
export async function GET(req:Request) {return handle(req,async()=>{
  const actor=await requireActor(req),repo=await getRepository(),snapshot=await repo.getSnapshot(actor),match=await currentMatch(repo,actor);
  const indexing=await reconcileIndex(repo,actor);
  void drainBackground(repo,actor).catch(()=>undefined);
  // Deeper runs extend their parent question's path (domains/backend/missions.ts).
  const missions=missionsFromRuns(await repo.getAgentRuns(actor,100));
  return json({...snapshot,indexing,missions,modelMode:process.env.FURTHER_MODEL_MODE==="fixture"?"fixture":"live",explorers:await repo.listCandidates(actor),match,currentSessionId:match?.sessionId??null});
});}
