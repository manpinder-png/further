import { handle, HttpError } from "@/domains/backend/http";
import { startGoogle } from "@/domains/backend/google-auth";
import { cognitoEnabled } from "@/domains/backend/cognito-config";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request) { return handle(req, () => { if (cognitoEnabled()) throw new HttpError(503, "Google sign-in is parked for this workspace."); return startGoogle(req); }); }
