import { randomUUID } from "node:crypto";
import { TeachRequest } from "@/lib/schemas";
import { invokeAgent, modelMode } from "@/domains/backend/agents";
import { body, handle, HttpError, idempotencyKey } from "@/domains/backend/http";
import { withProgress } from "@/domains/backend/streaming";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { OUTPUT_SCHEMAS } from "@/domains/agents/contracts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(req, async () => {
    const actorId = await requireActor(req);
    const { slug, depth, regenerate } = TeachRequest.parse(await body(req));
    const key=`teach:${idempotencyKey(req,randomUUID())}`;
    const demo=req.headers.get("x-further-demo") === "true";
    const repo=await getRepository();
    if(!demo && !(await repo.getSnapshot(actorId)).concepts.some(concept=>concept.slug===slug)) throw new HttpError(404,"Choose a topic from your saved path first.");
    const message=`Teach one useful idea in about 120–220 words, with a concrete mechanism, a small worked example and one prediction or application. Depth round ${depth} of 5: 1 is a first encounter; higher rounds should build on the supplied previous lessons with an edge case or counterexample, not repeat the same analogy. Explain any assumption the example depends on. Keep the learner's next action obvious.`;
    return withProgress(req,"learning-companion",async progress=>{
    if(!demo && !regenerate) {
      progress.activity("waiting","Checking your saved lesson.");
      const saved=await repo.getLatestLessonRun(actorId,slug,message,modelMode());
      if(saved?.output) {
        const lesson=OUTPUT_SCHEMAS["learning-companion"].safeParse(saved.output.data);
        if(lesson.success && lesson.data.mode==="solo") {
          progress.activity("completed","Restored your saved lesson. No new AI request was needed.");
          return {slug,...lesson.data,demo:modelMode()==="fixture",runId:saved.id,provider:saved.provider,model:saved.model,restored:true};
        }
      }
    }
    // Learner state is read by the actor-scoped tool port, not accepted from the browser's summary.
    const result = await invokeAgent(actorId, "learning-companion", {
      mode: "solo", concept: slug,
      message,
    }, { idempotencyKey:key, signal:progress.signal,onEvent:progress.onEvent, fixture: demo });
    return { slug, ...result.data, demo: result.mode === "fixture", runId: result.runId, provider: result.provider, model: result.model,restored:false };
    });
  });
}
