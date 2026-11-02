import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { FurtherRepository,VectorRecord } from "../data/contracts";

export const EMBEDDING_MODEL="FacebookAI/roberta-base";
export const EMBEDDING_REVISION="e2da8e2f811d1448a5b465c236feacd80ffbac7b:mean-mask-l2-v1";
const response=z.object({vectors:z.array(z.array(z.number().finite()).length(768)),model:z.literal(EMBEDDING_MODEL),revision:z.literal(EMBEDDING_REVISION),mode:z.literal("local-meta")});
function endpoint(){const url=new URL(process.env.FURTHER_EMBEDDING_URL??"http://127.0.0.1:8767");if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname)||url.protocol!=="http:")throw new Error("Embeddings must remain on loopback.");return url.origin;}
export async function embeddingHealth(){try{const r=await fetch(`${endpoint()}/health`,{signal:AbortSignal.timeout(1200),cache:"no-store"});if(!r.ok)return {status:"unavailable"};return await r.json();}catch{return {status:"unavailable",model:EMBEDDING_MODEL,dimensions:768};}}
export async function embed(texts:string[],signal?:AbortSignal){
  const token=process.env.FURTHER_EMBEDDING_TOKEN??(await readFile(resolve(".local/embedding-token"),"utf8")).trim();
  const r=await fetch(`${endpoint()}/embed`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({texts}),signal:AbortSignal.any([AbortSignal.timeout(45_000),...(signal?[signal]:[])])});
  if(!r.ok)throw new Error("Local embeddings are unavailable.");
  const data=response.parse(await r.json());
  if(data.vectors.length!==texts.length)throw new Error("Embedding count mismatch.");
  return data;
}
export async function indexText(repo:FurtherRepository,actorId:string,items:Array<{entityType:VectorRecord["entityType"];entityId:string;text:string}>,signal?:AbortSignal){
  for(let i=0;i<items.length;i+=16){const batch=items.slice(i,i+16),result=await embed(batch.map(x=>x.text),signal);for(let j=0;j<batch.length;j++){const item=batch[j];await repo.putVector({...item,id:randomUUID(),actorId,vector:result.vectors[j],model:result.model,modelRevision:result.revision,dimensions:768,contentHash:createHash("sha256").update(item.text).digest("hex"),mode:"local-meta"});}}
}
export async function search(repo:FurtherRepository,actorId:string,text:string,signal?:AbortSignal){const r=await embed([text],signal);return repo.searchVectors(actorId,r.vectors[0],{model:r.model,modelRevision:r.revision,limit:8});}
