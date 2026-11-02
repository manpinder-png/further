import { handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { currentMatch } from "@/domains/backend/social";
export const dynamic="force-dynamic";
export async function GET(req:Request) { return handle(req,async()=>{const actor=await requireActor(req),repo=await getRepository();return json({explorers:await repo.listCandidates(actor),match:await currentMatch(repo,actor)});}); }
export async function POST(req:Request) { return handle(req,async()=>{const actor=await requireActor(req),repo=await getRepository();await repo.heartbeat(actor);return json({explorers:await repo.listCandidates(actor),match:await currentMatch(repo,actor)});}); }
