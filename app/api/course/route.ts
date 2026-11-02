import { randomUUID } from "node:crypto";
import { CourseRequest, CourseResult } from "@/lib/schemas";
import { invokeAgent } from "@/domains/backend/agents";
import { body, handle, idempotencyKey } from "@/domains/backend/http";
import { withProgress } from "@/domains/backend/streaming";
import { requireActor } from "@/domains/backend/identity";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(req, async () => {
    const actorId = await requireActor(req);
    const { slug } = CourseRequest.parse(await body(req));
    const key=`course:${idempotencyKey(req,randomUUID())}`;
    return withProgress(req,"learning-companion",async progress=>{
    const result = await invokeAgent(actorId, "learning-companion", {
      mode: "solo", presentation: "course", concept: slug,
      message: "Write a concise course with 3–5 short lessons, a concrete example and a recall activity. Keep adaptedNote under 240 characters.",
    }, { idempotencyKey:key, signal:progress.signal,onEvent:progress.onEvent, fixture: req.headers.get("x-further-demo") === "true" });
    const course = CourseResult.parse({ lessons: result.data.lessons, adaptedNote: result.data.adaptedNote.slice(0, 240) });
    return { slug, title: result.data.title, ...course, demo: result.mode === "fixture", runId: result.runId, provider: result.provider, model: result.model };
    });
  });
}
