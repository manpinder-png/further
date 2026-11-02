import { handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { indexText } from "@/domains/retrieval/client";
export async function POST(req:Request){return handle(req,async()=>{const actor=await requireActor(req),repo=await getRepository(),s=await repo.getSnapshot(actor);const items=s.concepts.map(c=>({entityType:"concept" as const,entityId:c.slug,text:`${c.title}. ${c.hook}`}));await indexText(repo,actor,items,req.signal);if(s.profile.currentIntent)await indexText(repo,actor,[{entityType:"intent",entityId:"current",text:s.profile.currentIntent}],req.signal);return json({indexed:items.length+(s.profile.currentIntent?1:0),mode:"local-meta"});});}
