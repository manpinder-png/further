import { body, handle, json } from "@/domains/backend/http";
import { SignupRequest, accountError, hashPassword, rateLimit, signedInResponse } from "@/domains/backend/auth";
import { getRepository } from "@/domains/data/repository";
import { cognitoEnabled } from "@/domains/backend/cognito-config";
import { signupCognito } from "@/domains/backend/cognito-auth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return handle(req, async () => {
    await rateLimit("signup", 20);
    const input = SignupRequest.parse(await body(req, 4000));
    if (cognitoEnabled()) return json(await signupCognito(input));
    const passwordHash = await hashPassword(input.password);
    try {
      const account = await (await getRepository()).auth.createPasswordAccount({ email: input.email, username: input.username, displayName: input.displayName, passwordHash });
      return signedInResponse(account, req);
    } catch (error) { return accountError(error); }
  });
}
