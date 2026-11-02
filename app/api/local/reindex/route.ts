import { handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { drainBackground,reconcileIndex } from "@/domains/retrieval/client";

/** Reconcile durable jobs and return immediately; inference runs in the worker. */
export async function POST(req:Request) {
  return handle(req,async()=> {
    const actor=await requireActor(req),repo=await getRepository();
    const status=await reconcileIndex(repo,actor);
    void drainBackground(repo,actor).catch(()=>undefined);
    return json({indexing:status,mode:"local-meta"});
  });
}
