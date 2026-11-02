import { handle, json } from "@/domains/backend/http";
import { requireActor } from "@/domains/backend/identity";
import { verifySourceLink } from "@/domains/backend/source-verification";
import { VerifyRequest } from "@/lib/schemas";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {return handle(req,async()=>{
  await requireActor(req);
  const p = VerifyRequest.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ ok: false, error: "Invalid URL" }, { status: 400 });
  return json(await verifySourceLink(p.data.url,{signal:req.signal}));
});}
