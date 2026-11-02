import { handle,json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { drainBackground,reconcileIndex } from "@/domains/retrieval/client";

/** Owner-only counts. Reading also resumes recoverable work after a restart. */
export async function GET(req:Request) {
  return handle(req,async()=> {
    const actor=await requireActor(req),repo=await getRepository();
    const indexing=await reconcileIndex(repo,actor);
    void drainBackground(repo,actor).catch(()=>undefined);
    return json({indexing});
  });
}
