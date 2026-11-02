import { body, handle, HttpError } from "@/domains/backend/http";
import { LoginRequest, hashToken, rateLimit, signedInResponse, verifyPassword } from "@/domains/backend/auth";
import { getRepository } from "@/domains/data/repository";
import { cognitoEnabled } from "@/domains/backend/cognito-config";
import { signinCognito } from "@/domains/backend/cognito-auth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return handle(req, async () => {
    const input = LoginRequest.parse(await body(req, 4000));
    await rateLimit("login-global", 100);
    await rateLimit("login:" + input.email, 10);
    if (cognitoEnabled()) {
      const response = await signinCognito(req, input);
      await (await getRepository()).auth.clearAttempts(hashToken("login:" + input.email));
      return response;
    }
    const repo = await getRepository(), credential = await repo.auth.passwordCredential(input.email);
    if (!await verifyPassword(input.password, credential?.passwordHash ?? null) || !credential) throw new HttpError(401, "Email or password is incorrect.");
    await repo.auth.clearAttempts(hashToken("login:" + input.email));
    return signedInResponse(credential.account, req);
  });
}
