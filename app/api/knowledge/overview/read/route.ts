import { body, handle, json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { getKnowledgeOverview, KnowledgeOverviewScopeSchema } from "@/domains/backend/knowledge-overview";

export const dynamic = "force-dynamic";
/** POST permits a large owned branch scope without encoding it in a URL. No inference or writes. */
export async function POST(req: Request) {
  return handle(req, async () => {
    const actor = await requireActor(req), input = KnowledgeOverviewScopeSchema.parse(await body(req));
    return json(await getKnowledgeOverview(await getRepository(), actor, undefined, input.conceptSlugs));
  });
}
