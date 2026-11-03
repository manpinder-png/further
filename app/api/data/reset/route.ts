import { z } from "zod";
import { body, handle, HttpError, idempotencyKey, json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { getRepository } from "@/domains/data/repository";

export const dynamic = "force-dynamic";
const ResetRequest = z.object({
  confirmation: z.literal("RESET"),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:_.-]{1,160}$/),
}).strict();

export async function POST(req: Request) {
  return handle(req, async () => {
    const actorId = await requireActor(req);
    if (req.headers.get("x-further-demo") === "true") throw new HttpError(400, "Return to your saved map before resetting it.");
    const input = ResetRequest.parse(await body(req));
    const key = idempotencyKey(req, input.idempotencyKey);
    if (key !== input.idempotencyKey) throw new HttpError(400, "The reset request keys do not match.");
    await (await getRepository()).resetLearningMap(actorId, key);
    return json({ ok: true });
  });
}
