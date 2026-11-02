import { body, handle, HttpError, json } from "@/domains/backend/http";
import { rateLimit } from "@/domains/backend/auth";
import { cognitoEnabled } from "@/domains/backend/cognito-config";
import { ConfirmSignupRequest, cognitoApi } from "@/domains/backend/cognito-auth";
export const dynamic = "force-dynamic";
export async function POST(req: Request) { return handle(req, async () => {
  if (!cognitoEnabled()) throw new HttpError(404, "Email confirmation is not configured for this workspace.");
  const input = ConfirmSignupRequest.parse(await body(req, 2000));
  await rateLimit("confirm:" + input.email, 10);
  await cognitoApi("ConfirmSignUp", { Username: input.email, ConfirmationCode: input.code });
  return json({ confirmed: true });
}); }
