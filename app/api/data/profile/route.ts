import { z } from "zod";
import { body,handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { ProfileUpdateRequest } from "@/lib/schemas";
export const dynamic="force-dynamic";
export async function PATCH(req:Request) {return handle(req,async()=>{const actor=await requireActor(req),repo=await getRepository();const patch=ProfileUpdateRequest.partial().extend({availableMinutes:z.number().int().min(1).max(240).optional()}).strict().parse(await body(req));return json({profile:await repo.updateProfile(actor,patch),ok:true});});}
