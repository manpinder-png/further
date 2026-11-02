import { body,handle,json,HttpError } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { MatchDecision } from "@/lib/schemas";
import { suggestMatch,toMatch } from "@/domains/backend/social";
export const dynamic="force-dynamic";
export async function POST(req:Request) {return handle(req,async()=>{const actor=await requireActor(req),repo=await getRepository(),input=await body(req),decision=MatchDecision.safeParse(input);if(input&&typeof input==="object"&&("decision" in input||"requestId" in input)&&!decision.success)throw new HttpError(400,"Choose accept or decline for a valid invitation.");if(decision.success){const inv=await repo.respondToInvite(actor,decision.data.requestId,decision.data.decision);const m=await toMatch(repo,actor,inv);return json({ok:true,status:m.status,session_id:inv.sessionId,sessionId:inv.sessionId,match:m,demo:false});}return json(await suggestMatch(repo,actor));});}
export async function GET(req:Request) {return handle(req,async()=>{const actor=await requireActor(req),repo=await getRepository(),id=new URL(req.url).searchParams.get("requestId");if(!id)throw new HttpError(400,"Invitation is required.");const inv=await repo.getInvitation(actor,id),match=await toMatch(repo,actor,inv);return json({status:match.status,sessionId:inv.sessionId??null,expiresAt:inv.expiresAt,match});});}
