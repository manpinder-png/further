import { handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { roomView } from "@/domains/backend/social";
export const dynamic="force-dynamic";
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}) {return handle(req,async()=>{const actor=await requireActor(req),repo=await getRepository(),{id}=await ctx.params;return json(await roomView(repo,actor,await repo.getSession(actor,id)));});}
