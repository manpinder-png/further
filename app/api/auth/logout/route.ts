import { handle, json } from "@/domains/backend/http";
import { assertExpectedActor, clearAccountCookie, currentAccount, revokeCurrentSession } from "@/domains/backend/auth";
import { getRepository } from "@/domains/data/repository";
import { cognitoEnabled } from "@/domains/backend/cognito-config";
import { clearCognitoCookie } from "@/domains/backend/cognito-auth";
import { cognitoLogoutUrl } from "@/domains/backend/cognito-oauth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return handle(req, async () => {
    const account = await currentAccount(req);
    assertExpectedActor(req, account?.learnerId ?? null);
    // Stop advertising availability as soon as this account signs out.
    if (account) await (await getRepository()).updateProfile(account.learnerId, { openToMatch: false });
    await revokeCurrentSession(req);
    const headers = new Headers();
    headers.append("set-cookie", clearAccountCookie(req));
    headers.append("set-cookie", clearCognitoCookie(req));
    headers.append("set-cookie", "further_local_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    return json({ authenticated: false, account: null, ...(cognitoEnabled() ? { logoutUrl: cognitoLogoutUrl(req) } : {}) }, 200, headers);
  });
}
