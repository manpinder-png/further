import { body,handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { PersistConceptRequest } from "@/lib/schemas";
export const dynamic="force-dynamic";
export async function POST(req:Request) {return handle(req,async()=>{const actor=await requireActor(req),repo=await getRepository(),p=PersistConceptRequest.parse(await body(req));await repo.addConcepts(actor,[p.concept],p.edge?[{src:p.edge.from,dst:p.concept.slug,kind:p.edge.kind}]:[]);return json({ok:true,persisted:true});});}
