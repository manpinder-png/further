import { handle, HttpError } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { mediaStorage } from "@/domains/backend/media-storage";
import { getRepository } from "@/domains/data/repository";

export const dynamic = "force-dynamic";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  return handle(req, async () => {
    const actor = await requireActor(req);
    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(404, "Image not found.");
    // Repository ownership must succeed before any filesystem or S3 operation.
    const record = await (await getRepository()).getMedia(actor, id);
    const bytes = await mediaStorage().readImage(actor, record, req.signal);
    return new Response(new Uint8Array(bytes), { headers: {
      "content-type": record.mimeType,
      "content-length": String(bytes.length),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
    } });
  });
}
