import { systemStatus } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(systemStatus());
}
