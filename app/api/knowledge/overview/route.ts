import { body, handle, json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { generateKnowledgeOverview, getKnowledgeOverview, KnowledgeOverviewRequestSchema } from "@/domains/backend/knowledge-overview";
import { withProgress } from "@/domains/backend/streaming";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return handle(req, async () => json(await getKnowledgeOverview(await getRepository(), await requireActor(req))));
}
export async function POST(req: Request) {
  return handle(req, async () => {
    const actor = await requireActor(req), input = KnowledgeOverviewRequestSchema.parse(await body(req));
    return withProgress(req, "knowledge-map", progress => generateKnowledgeOverview(actor, input, { signal: progress.signal, onEvent: progress.onEvent }), { accepted: "Reading the concepts in your saved knowledge map." });
  });
}
