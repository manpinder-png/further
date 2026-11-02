import { handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
export const dynamic="force-dynamic";
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}) {return handle(req,async()=>{const actor=await requireActor(req),repo=await getRepository(),{id}=await ctx.params,session=await repo.getSession(actor,id);for(const peer of session.participants.filter(x=>x!==actor))await repo.block(actor,peer);return json({ok:true,status:"blocked"});});}
