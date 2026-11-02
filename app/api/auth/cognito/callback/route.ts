import { errorResponse } from "@/domains/backend/http";
import { finishCognito } from "@/domains/backend/cognito-oauth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request) { try { return await finishCognito(req); } catch (error) { return errorResponse(error); } }
