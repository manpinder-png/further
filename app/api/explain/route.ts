import { randomUUID } from "node:crypto";
import { ExplainRequest, ExplainResult } from "@/lib/schemas";
import { invokeAgent } from "@/domains/backend/agents";
import { body, handle, HttpError, idempotencyKey, json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { withProgress } from "@/domains/backend/streaming";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(req, async () => {
    const actorId = await requireActor(req);
    const { slug, transcript } = ExplainRequest.parse(await body(req));
    const fixture = req.headers.get("x-further-demo") === "true";
    const repo = await getRepository();
    if (!fixture && !(await repo.getSnapshot(actorId)).concepts.some(c => c.slug === slug)) throw new HttpError(404, "Open a topic from your map before explaining it.");
    const key=`explain:${idempotencyKey(req,randomUUID())}`;
    return withProgress(req,"learning-companion",async progress=>{
    const result = await invokeAgent(actorId, "learning-companion", {
      mode: "explain-back", concept: slug, message: transcript,
    }, { idempotencyKey:key, signal:progress.signal,onEvent:progress.onEvent, fixture });
    // Rehearsal feedback is deliberately ungraded and never becomes mastery evidence.
    if (result.mode === "fixture") return { score: null, feedback: result.data.body, demo: true, persisted: false, runId: result.runId };
    const grade = ExplainResult.parse({ score: result.data.score, feedback: result.data.body });
    progress.activity("saving","Saving your explanation feedback.");
    await repo.recordEvent(actorId, {
      slug, kind: "explain", idempotencyKey: `explain:${result.runId}`,
      payload: { score: grade.score, feedback: grade.feedback, source: "agent", model: result.model, provider: result.provider, runId: result.runId, schemaVersion: 1 },
    });
    return { ...grade, demo: false, persisted: true, runId: result.runId };
    },{jsonResponse:result=>json(result,200,result.persisted?{"x-further-persisted":"true"}:{})});
  });
}
