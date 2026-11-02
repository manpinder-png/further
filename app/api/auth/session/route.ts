import { handle, json } from "@/domains/backend/http";
import { authSession } from "@/domains/backend/google-auth";
import { currentAccount } from "@/domains/backend/auth";
import { cognitoEnabled, cognitoConfigured, cognitoConfig } from "@/domains/backend/cognito-config";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request) { return handle(req, async () => {
  if (!cognitoEnabled()) return json(await authSession(req));
  const configured = cognitoConfigured(), account = await currentAccount(req);
  return json({ authenticated: Boolean(account), account, authProvider: "cognito", providers: { google: { configured: false }, cognito: { configured }, facebook: { configured: configured && cognitoConfig().facebookConfigured } }, localProfilesEnabled: false });
}); }
