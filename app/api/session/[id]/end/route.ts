import { handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { roomView } from "@/domains/backend/social";
export const dynamic="force-dynamic";
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}) {return handle(req,async()=>{const actor=await requireActor(req),repo=await getRepository(),{id}=await ctx.params;const session=await repo.completeSession(actor,id,["Session ended. Progress records participation, not a validated mastery assessment."]);return json({ok:true,status:"finished",persisted:true,session:await roomView(repo,actor,session)});});}
