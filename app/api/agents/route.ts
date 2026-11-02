import { z } from "zod";
import { AGENT_CARDS,INPUT_SCHEMAS,OUTPUT_SCHEMAS } from "@/domains/agents";
import { handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
export const dynamic="force-dynamic";
export async function GET(req:Request){return handle(req,async()=>{const actor=await requireActor(req);return json({protocol:"further-http-json",version:"1.0",scope:"local",agents:AGENT_CARDS.map(card=>({...card,endpoint:`/api/agents/${card.id}`,inputSchema:z.toJSONSchema(INPUT_SCHEMAS[card.id]),outputSchema:z.toJSONSchema(OUTPUT_SCHEMAS[card.id])})),runs:(await(await getRepository()).getAgentRuns(actor,20)).map(({id,agentId,status,model,provider,createdAt,finishedAt})=>({id,agentId,status,model,provider,createdAt,finishedAt}))});});}
