import { body, handle, json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";
import { GeomindInviteSchema, inviteGeomindNeighbor } from "@/domains/backend/geomind";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return handle(req, async () => {
    const actor = await requireActor(req);
    const input = GeomindInviteSchema.parse(await body(req));
    return json({ match: await inviteGeomindNeighbor(await getRepository(), actor, input.peerId, input.conceptSlug, input.peerConceptSlug) });
  });
}
