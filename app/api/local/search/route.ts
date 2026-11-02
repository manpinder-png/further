import { z } from "zod";
import { body,handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { search } from "@/domains/retrieval/client";
export async function POST(req:Request){return handle(req,async()=>{const actor=await requireActor(req),{query}=z.object({query:z.string().trim().min(1).max(2000)}).strict().parse(await body(req));return json({hits:await search(await getRepository(),actor,query,req.signal),mode:"local-meta",quality:"General RoBERTa features: experimental retrieval baseline, not a trained sentence retriever."});});}
