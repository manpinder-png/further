import { systemStatus } from "@/lib/server/config";
import { embeddingHealth } from "@/domains/retrieval/client";
import { handle,json } from "@/domains/backend/http";
export const dynamic="force-dynamic";
export async function GET(req:Request){return handle(req,async()=>{const embedding=await embeddingHealth();return json({...systemStatus(),embeddings:embedding.status==="ready"?"local":"down",embedding});});}
