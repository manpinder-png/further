import { randomUUID } from "node:crypto";
import { ExpandRequest } from "@/lib/schemas";
import { body, handle, idempotencyKey } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { invokeAgent } from "@/domains/backend/agents";
import { withProgress } from "@/domains/backend/streaming";
import type { ExpansionLine } from "@/lib/types";
export const dynamic="force-dynamic";
export async function POST(req:Request){return handle(req,async()=>{
  const actor=await requireActor(req),input=ExpandRequest.parse(await body(req)),start=Date.now();
  const key=idempotencyKey(req,randomUUID());
  return withProgress(req,"knowledge-map",async progress=>{
  const result=await invokeAgent(actor,"knowledge-map",{text:input.text,objective:"expand"},{signal:progress.signal,onEvent:progress.onEvent,idempotencyKey:key,fixture:req.headers.get("x-further-demo")==="true"});
  const d=result.data;
  // The validated graph is saved before acknowledging any node in the stream.
  const lines:ExpansionLine[]=[{type:"intent",intent:d.intent,root:d.root,rootTitle:d.rootTitle},...d.concepts.map(c=>({type:"node" as const,...c,edge:c.edge??{from:d.root,kind:"related" as const},difficulty:Math.max(1,Math.round(c.difficulty*4+1)),canonical:null})),{type:"done",count:d.concepts.length,ms:Date.now()-start}];
  return {runId:result.runId,lines,persisted:result.persisted,mode:result.mode==="fixture"?"demo":"live",...(result.indexWarning?{indexWarning:result.indexWarning}:{})};
  },{jsonResponse:result=>new Response(result.lines.map(l=>`data: ${JSON.stringify(l)}\n\n`).join(""),{headers:{"content-type":"text/event-stream","cache-control":"no-store","x-further-persisted":String(result.persisted),"x-further-mode":result.mode,...(result.indexWarning?{"x-further-index":"pending"}:{})}})});
});}
