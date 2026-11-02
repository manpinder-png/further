import { z } from "zod";
import { randomUUID } from "node:crypto";
import { body,handle,json,idempotencyKey,HttpError } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { LearningEventRequest } from "@/lib/schemas";
export const dynamic="force-dynamic";
export async function POST(req:Request) {return handle(req,async()=>{
  const actor=await requireActor(req),repo=await getRepository();
  const p=LearningEventRequest.extend({idempotencyKey:z.string().max(160).optional()}).parse(await body(req));
  if(p.kind==="explain"||p.kind==="session")throw new HttpError(400,"Use the assessment or session endpoint to record this outcome.");
  const snapshot=await repo.getSnapshot(actor);
  if(!snapshot.nodes[p.slug])throw new HttpError(404,"Add the topic to your map first.");
  const event=await repo.recordEvent(actor,{...p,idempotencyKey:idempotencyKey(req,p.idempotencyKey??randomUUID())});
  return json({ok:true,event,persisted:true});
});}
