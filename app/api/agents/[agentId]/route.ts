import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AgentIdSchema, INPUT_SCHEMAS, type AgentInput } from "@/domains/agents";
import { invokeAgent } from "@/domains/backend/agents";
import { body,handle,idempotencyKey } from "@/domains/backend/http";
import { withProgress } from "@/domains/backend/streaming";
import { requireActor } from "@/domains/backend/identity";
export const dynamic="force-dynamic";
export async function POST(req:Request,ctx:{params:Promise<{agentId:string}>}){return handle(req,async()=>{
  const actor=await requireActor(req),id=AgentIdSchema.parse((await ctx.params).agentId),data=z.object({input:z.unknown(),idempotencyKey:z.string().regex(/^[A-Za-z0-9:_.-]{1,160}$/).optional()}).strict().parse(await body(req,15_000_000));
  const input=INPUT_SCHEMAS[id].parse(data.input),key=idempotencyKey(req,data.idempotencyKey??randomUUID());
  return withProgress(req,id,progress=>invokeAgent(actor,id,input as AgentInput<typeof id>,{idempotencyKey:key,signal:progress.signal,onEvent:progress.onEvent,fixture:req.headers.get("x-further-demo")==="true"}));
});}
