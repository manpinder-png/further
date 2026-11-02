import { z } from "zod";
import { body, handle, HttpError, json } from "@/domains/backend/http";
import { rateLimit } from "@/domains/backend/auth";
import { cognitoEnabled } from "@/domains/backend/cognito-config";
import { cognitoApi } from "@/domains/backend/cognito-auth";
export const dynamic = "force-dynamic";
export async function POST(req: Request) { return handle(req, async () => {
  if (!cognitoEnabled()) throw new HttpError(404, "Email confirmation is not configured for this workspace.");
  const { email } = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict().parse(await body(req, 2000));
  await rateLimit("resend:" + email, 3);
  await cognitoApi("ResendConfirmationCode", { Username: email });
  return json({ sent: true, message: "Check your email for a new verification code." });
}); }
