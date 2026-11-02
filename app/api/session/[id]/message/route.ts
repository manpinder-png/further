import { z } from "zod";
import { randomUUID } from "node:crypto";
import { body,handle,HttpError,idempotencyKey,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { invokeAgent } from "@/domains/backend/agents";
import { getRepository } from "@/domains/data/repository";
import { roomView } from "@/domains/backend/social";
import { withProgress } from "@/domains/backend/streaming";
export const dynamic="force-dynamic";
const Message=z.object({text:z.string().trim().min(1).max(1000),idempotencyKey:z.string().regex(/^[A-Za-z0-9:_.-]{1,160}$/).optional()});
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return handle(req,async()=>{
  const actor=await requireActor(req),id=(await ctx.params).id,repo=await getRepository();
  const room=await repo.getSession(actor,id); // Authorize membership before model or storage work.
  if(room.endedAt)throw new HttpError(409,"This session has ended.");
  const input=Message.parse(await body(req)),key=idempotencyKey(req,input.idempotencyKey??randomUUID());
  return withProgress(req,"learning-companion",async progress=>{
  const message=await repo.appendMessage(actor,id,input.text,{idempotencyKey:key});
  progress.activity("saving","Your message is saved in the shared conversation.");
  const fresh=await repo.getSession(actor,id);
  if(room.messages.some(m=>m.id===message.id)){
    progress.activity("waiting","Your message is saved. Checking the current conversation.");
    return {...(await roomView(repo,actor,fresh)),delivered:true,facilitator:null,done:false,replayed:true};
  }
  let facilitator:string|null=null,error:string|undefined;
  let provider="local",model="none",mode="live";
  try{
    const profiles=await Promise.all(fresh.participants.map(p=>repo.getProfile(p)));
    const result=await invokeAgent(actor,"learning-companion",{mode:"facilitate",concept:fresh.conceptSlug,message:input.text,context:{participants:profiles.map(p=>({displayName:p.displayName})),sharedConcept:fresh.conceptSlug,invitationContext:fresh.context},history:fresh.messages.slice(-20).map(m=>({role:m.kind==="human"?"user" as const:"assistant" as const,content:m.text}))},{idempotencyKey:`session:${id}:${message.id}`,signal:progress.signal,onEvent:progress.onEvent});
    facilitator=result.data.body;provider=result.provider;model=result.model;mode=result.mode;
    progress.activity("saving","Saving the facilitator response.");
    await repo.appendMessage(actor,id,facilitator,{kind:"facilitator",idempotencyKey:`facilitator:${message.id}`,provenance:{source:"agent",model,runId:result.runId,schemaVersion:1}});
  }catch{error="Your message was saved. The facilitator could not respond this time.";}
  return {...(await roomView(repo,actor,await repo.getSession(actor,id))),delivered:true,facilitator,facilitatorError:error,done:false,demo:mode==="fixture",provenance:{provider,model,mode},verdict:{safe:true,engine:"local-length-validation",ms:0},moderation:"No automated content classifier is configured; block and report are available."};
  });
});}
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return handle(req,async()=>{const actor=await requireActor(req),repo=await getRepository();return json(await roomView(repo,actor,await repo.getSession(actor,(await ctx.params).id)));});}
