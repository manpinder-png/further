// DEMO stand-in for Supabase Realtime: the map polls for off-app captures (MCP).
import { readInbox } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || 0;
  return Response.json({ items: readInbox(after) });
}
