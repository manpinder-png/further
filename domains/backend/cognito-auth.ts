import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import type { Account } from "../data/auth-contracts";
import { getRepository } from "../data/repository";
import { accountError, cookieValue, signedInResponse } from "./auth";
import { HttpError } from "./http";
import { cognitoConfig, type CognitoConfig } from "./cognito-config";

export const COGNITO_ACCESS_COOKIE = "further_cognito_access";
const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function keyset(config: CognitoConfig) {
  let keys = keysets.get(config.issuer);
  if (!keys) { keys = createRemoteJWKSet(new URL(`${config.issuer}/.well-known/jwks.json`), { timeoutDuration: 10_000, cooldownDuration: 30_000 }); keysets.set(config.issuer, keys); }
  return keys;
}
export interface CognitoTokens { accessToken: string; idToken: string }
export interface VerifiedCognitoIdentity { subject: string; email: string; displayName: string; username?: string; emailVerified: boolean; expiresAt: number }
const tokenSize = z.string().min(32).max(16_000);
const email = z.string().email().max(254);

/** Signature, issuer, client, purpose, expiry and paired subjects are checked before any account write. */
export async function verifyCognitoTokens(tokens: CognitoTokens, options: { nonce?: string; keys?: JWTVerifyGetKey; config?: CognitoConfig } = {}): Promise<VerifiedCognitoIdentity> {
  const config = options.config ?? cognitoConfig(), keys = options.keys ?? keyset(config);
  try {
    const id = (await jwtVerify(tokenSize.parse(tokens.idToken), keys, { issuer: config.issuer, audience: config.clientId, algorithms: ["RS256"] })).payload;
    const access = (await jwtVerify(tokenSize.parse(tokens.accessToken), keys, { issuer: config.issuer, algorithms: ["RS256"] })).payload;
    if (id.token_use !== "id" || access.token_use !== "access" || access.client_id !== config.clientId || typeof id.sub !== "string" || !id.sub || id.sub.length > 255 || access.sub !== id.sub || typeof id.exp !== "number" || typeof access.exp !== "number" || (options.nonce !== undefined && id.nonce !== options.nonce)) throw new Error("Invalid token claims");
    const address = email.parse(id.email).trim().toLowerCase();
    const username = typeof id.preferred_username === "string" && /^[a-z0-9_]{3,24}$/.test(id.preferred_username) ? id.preferred_username : undefined;
    return { subject: id.sub, email: address, displayName: (typeof id.name === "string" && id.name.trim() ? id.name.trim() : username ?? "Learner").slice(0,60), ...(username ? { username } : {}), emailVerified: id.email_verified === true, expiresAt: Math.min(id.exp, access.exp) * 1000 };
  } catch { throw new HttpError(401, "AWS could not verify this sign-in. Please sign in again."); }
}

export function cognitoAccessCookie(token: string, req: Request, expiresAt: number) {
  const seconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return `${COGNITO_ACCESS_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
export const clearCognitoCookie = (req: Request) => cognitoAccessCookie("", req, 0);

/** Opaque app sessions provide immediate local revocation; the access JWT is independently checked each request. */
export async function validateCognitoSession(req: Request, account: Account): Promise<boolean> {
  const token = cookieValue(req, COGNITO_ACCESS_COOKIE);
  if (!token || token.length > 16_000 || account.provider !== "cognito") return false;
  try {
    const config = cognitoConfig(), claims = (await jwtVerify(token, keyset(config), { issuer: config.issuer, algorithms: ["RS256"] })).payload;
    if (claims.token_use !== "access" || claims.client_id !== config.clientId || typeof claims.exp !== "number" || typeof claims.sub !== "string") return false;
    const identity = await (await getRepository()).auth.externalAccount("cognito", claims.sub);
    return identity?.id === account.id && identity.learnerId === account.learnerId;
  } catch { return false; }
}

export async function cognitoIdentityResponse(req: Request, tokens: CognitoTokens, options: { nonce?: string; requireVerifiedEmail?: boolean } = {}) {
  const identity = await verifyCognitoTokens(tokens, options);
  if (options.requireVerifiedEmail && !identity.emailVerified) throw new HttpError(403, "Verify your email address before signing in.", { code: "EMAIL_CONFIRMATION_REQUIRED" });
  const repo = await getRepository();
  let account: Account;
  try { account = await repo.auth.externalAccount("cognito", identity.subject) ?? await repo.auth.createExternalAccount({ provider: "cognito", ...identity }); }
  catch (error) { return accountError(error); }
  const response = await signedInResponse(account, req, identity.expiresAt);
  response.headers.append("set-cookie", cognitoAccessCookie(tokens.accessToken, req, identity.expiresAt));
  return response;
}

/** Public-client Cognito APIs do not use developer AWS credentials or a client secret. */
export async function cognitoApi(operation: "SignUp" | "ConfirmSignUp" | "ResendConfirmationCode" | "InitiateAuth", input: Record<string, unknown>) {
  const config = cognitoConfig();
  let response: Response;
  try { response = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, { method: "POST", headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": `AWSCognitoIdentityProviderService.${operation}` }, body: JSON.stringify({ ClientId: config.clientId, ...input }), cache: "no-store", signal: AbortSignal.timeout(20_000) }); }
  catch { throw new HttpError(503, "AWS sign-in could not be reached. Please try again."); }
  const data = await response.json().catch(()=>null) as Record<string, unknown> | null;
  if (!response.ok) {
    const code = typeof data?.__type === "string" ? data.__type.split(/[#:]/).at(-1) : "";
    if (code === "UserNotConfirmedException") throw new HttpError(403, "Verify your email address before signing in.", { code: "EMAIL_CONFIRMATION_REQUIRED" });
    if (code === "UsernameExistsException") throw new HttpError(409, "An account already uses that email. Sign in or verify your existing account.");
    if (code === "CodeMismatchException") throw new HttpError(400, "That verification code is incorrect. Check the email and try again.");
    if (code === "ExpiredCodeException") throw new HttpError(400, "That verification code expired. Request a new code.");
    if (code === "InvalidPasswordException") throw new HttpError(400, "Use at least 12 characters with uppercase, lowercase and a number.");
    if (code === "TooManyRequestsException" || code === "LimitExceededException") throw new HttpError(429, "Too many sign-in attempts. Wait a moment and try again.");
    if (code === "NotAuthorizedException" || code === "UserNotFoundException") throw new HttpError(401, "Email or password is incorrect.");
    throw new HttpError(502, "AWS could not complete this sign-in step. Please try again.");
  }
  if (!data) throw new HttpError(502, "AWS returned an incomplete sign-in response.");
  return data;
}

export async function signupCognito(input: { email: string; username: string; displayName: string; password: string }) {
  const response = await cognitoApi("SignUp", { Username: input.email, Password: input.password, UserAttributes: [{ Name: "email", Value: input.email }, { Name: "name", Value: input.displayName }, { Name: "preferred_username", Value: input.username }] });
  return { authenticated: false, confirmationRequired: response.UserConfirmed !== true, email: input.email, message: "Check your email for a verification code." };
}
export const ConfirmSignupRequest = z.object({ email: z.string().trim().toLowerCase().email().max(254), code: z.string().trim().regex(/^\d{6}$/, "Enter the six-digit code from your email.") }).strict();
export async function signinCognito(req: Request, input: { email: string; password: string }) {
  const response = await cognitoApi("InitiateAuth", { AuthFlow: "USER_PASSWORD_AUTH", AuthParameters: { USERNAME: input.email, PASSWORD: input.password } });
  const result = response.AuthenticationResult as Record<string, unknown> | undefined;
  if (!result || typeof result.AccessToken !== "string" || typeof result.IdToken !== "string") throw new HttpError(409, "This account needs an additional sign-in step. Contact the development administrator.");
  return cognitoIdentityResponse(req, { accessToken: result.AccessToken, idToken: result.IdToken }, { requireVerifiedEmail: true });
}
