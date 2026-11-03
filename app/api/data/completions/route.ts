import { CompletionCountsRequest } from "@/lib/completions";
import { body, handle, HttpError, json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return handle(req, async () => {
    const actorId = await requireActor(req);
    if (req.headers.get("x-further-demo") === "true") throw new HttpError(400, "Completion counts belong to saved maps, not sample data.");
    const { scopes } = CompletionCountsRequest.parse(await body(req, 1_000_000));
    return json({ counts: await (await getRepository()).getCompletionCounts(actorId, scopes) });
  });
}
