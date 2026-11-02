import { handle } from "@/domains/backend/http";
import { startCognito } from "@/domains/backend/cognito-oauth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request) { return handle(req, () => startCognito(req)); }
