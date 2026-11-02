import { errorResponse, HttpError } from "@/domains/backend/http";
import { finishGoogle } from "@/domains/backend/google-auth";
import { cognitoEnabled } from "@/domains/backend/cognito-config";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Google navigates here cross-site. finishGoogle validates host + bound one-use state.
export async function GET(req: Request) { try { if (cognitoEnabled()) throw new HttpError(503, "Google sign-in is parked for this workspace."); return await finishGoogle(req); } catch (error) { return errorResponse(error); } }
