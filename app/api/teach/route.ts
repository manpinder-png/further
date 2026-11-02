import { randomUUID } from "node:crypto";
import { TeachRequest } from "@/lib/schemas";
import { invokeAgent } from "@/domains/backend/agents";
import { body, handle, idempotencyKey } from "@/domains/backend/http";
import { withProgress } from "@/domains/backend/streaming";
import { requireActor } from "@/domains/backend/identity";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(req, async () => {
    const actorId = await requireActor(req);
    const { slug, depth } = TeachRequest.parse(await body(req));
    const key=`teach:${idempotencyKey(req,randomUUID())}`;
    return withProgress(req,"learning-companion",async progress=>{
    // Learner state is read by the actor-scoped tool port, not accepted from the browser's summary.
    const result = await invokeAgent(actorId, "learning-companion", {
      mode: "solo", concept: slug,
      message: `Create one short teaching moment. Depth round ${depth} of 5: 1 is a first encounter; higher rounds should add mechanism, edge cases and an activity. Keep the body under 700 characters.`,
    }, { idempotencyKey:key, signal:progress.signal,onEvent:progress.onEvent, fixture: req.headers.get("x-further-demo") === "true" });
    return { slug, ...result.data, demo: result.mode === "fixture", runId: result.runId, provider: result.provider, model: result.model };
    });
  });
}
