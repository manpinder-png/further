import { z } from "zod";
import { body,handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
export const dynamic="force-dynamic";
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}) {return handle(req,async()=>{const actor=await requireActor(req),repo=await getRepository(),{id}=await ctx.params;const {reason}=z.object({reason:z.string().trim().min(1).max(2000).default("Participant requested review")}).parse(await body(req));const session=await repo.getSession(actor,id);const reports=[];for(const peer of session.participants.filter(x=>x!==actor))reports.push(await repo.report(actor,peer,reason,id));return json({ok:true,status:"recorded",reportIds:reports});});}
