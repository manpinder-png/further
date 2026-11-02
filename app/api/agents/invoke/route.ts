import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AgentIdSchema, INPUT_SCHEMAS, type AgentInput } from "@/domains/agents";
import { invokeAgent } from "@/domains/backend/agents";
import { body,handle,idempotencyKey } from "@/domains/backend/http";
import { withProgress } from "@/domains/backend/streaming";
import { requireActor } from "@/domains/backend/identity";
export const dynamic="force-dynamic";
export async function POST(req:Request){return handle(req,async()=>{
  const actor=await requireActor(req),data=z.object({agentId:AgentIdSchema,input:z.unknown(),idempotencyKey:z.string().regex(/^[A-Za-z0-9:_.-]{1,160}$/).optional()}).strict().parse(await body(req,15_000_000));
  const input=INPUT_SCHEMAS[data.agentId].parse(data.input),key=idempotencyKey(req,data.idempotencyKey??randomUUID());
  return withProgress(req,data.agentId,progress=>invokeAgent(actor,data.agentId,input as AgentInput<typeof data.agentId>,{idempotencyKey:key,signal:progress.signal,onEvent:progress.onEvent,fixture:req.headers.get("x-further-demo")==="true"}));
});}
