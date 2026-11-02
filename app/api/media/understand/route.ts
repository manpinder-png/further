import { createHash,randomUUID } from "node:crypto";
import { mkdir,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { handle,HttpError,idempotencyKey } from "@/domains/backend/http";
import { withProgress } from "@/domains/backend/streaming";
import { requireActor } from "@/domains/backend/identity";
import { invokeAgent } from "@/domains/backend/agents";
import { getRepository } from "@/domains/data/repository";
export const dynamic="force-dynamic";
function imageType(bytes:Buffer){
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
  if(bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP")return "image/webp";
  return null;
}
export async function POST(req:Request){return handle(req,async()=>{
  const actor=await requireActor(req);
  if(Number(req.headers.get("content-length")??0)>10_500_000)throw new HttpError(413,"Choose an image under 10 MB.");
  const form=await req.formData(),file=form.get("image")??form.get("file");
  if(!(file instanceof File)||file.size>10_000_000||file.size===0)throw new HttpError(400,"Choose a PNG, JPEG or WebP image under 10 MB.");
  const bytes=Buffer.from(await file.arrayBuffer()),mime=imageType(bytes);
  if(!mime||mime!==file.type)throw new HttpError(400,"The image format could not be verified.");
  const demo=req.headers.get("x-further-demo")==="true",key=idempotencyKey(req,randomUUID());
  return withProgress(req,"perception",async progress=>{
  progress.activity("tool_completed","Image upload received and format checked.");
  const result=await invokeAgent(actor,"perception",{imageDataUrl:`data:${mime};base64,${bytes.toString("base64")}`},{idempotencyKey:key,signal:progress.signal,onEvent:progress.onEvent,fixture:demo});
  let mediaId:string|undefined;
  const provenance={source:"agent" as const,model:result.model,runId:result.runId,confirmed:false,schemaVersion:1};
  if(!demo){
    progress.activity("saving","Saving the image and its description locally.");
    const hash=createHash("sha256").update(bytes).digest("hex"),dir=resolve(process.env.FURTHER_LOCAL_DIR??".local","media",actor);
    await mkdir(dir,{recursive:true,mode:0o700});const path=resolve(dir,hash);await writeFile(path,bytes,{mode:0o600});
    const saved=await(await getRepository()).saveMedia({actorId:actor,kind:"image",mimeType:mime,byteSize:bytes.length,contentHash:hash,localPath:path,extractedText:result.data.description,provenance});mediaId=saved.id;
  }
  return {text:result.data.suggestedCuriosity,...result.data,mediaId,provenance:{...provenance,provider:result.provider,mode:result.mode},demo:result.mode==="fixture"};
  });
});}
