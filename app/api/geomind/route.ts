import { body, handle, json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { GeomindRequestSchema, geomindNeighborhood } from "@/domains/backend/geomind";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return handle(req, async () => {
    const actor = await requireActor(req);
    const input = GeomindRequestSchema.parse(await body(req));
    return json(await geomindNeighborhood(await getRepository(), actor, input.conceptSlugs));
  });
}
