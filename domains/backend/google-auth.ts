import { randomBytes, timingSafeEqual } from "node:crypto";
import { OAuth2Client, CodeChallengeMethod, type TokenPayload } from "google-auth-library";
import { getRepository } from "../data/repository";
import { AccountConflict } from "../data/auth-store";
import type { AuthSession } from "../../lib/auth-contracts";
import { cookieValue, currentAccount, hashToken, issueSession, localProfilesEnabled, rateLimit } from "./auth";
import { HttpError, localOrigin } from "./http";

const FLOW_COOKIE = "further_google_state";
const CALLBACK_PATH = "/api/auth/google/callback";
const GOOGLE_SCOPES = ["openid", "email", "profile"];
export function googleConfigured() { return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()); }
export async function authSession(req: Request): Promise<AuthSession> {
  const account = await currentAccount(req);
  return { authenticated: Boolean(account), account, providers: { google: { configured: googleConfigured() } }, localProfilesEnabled: localProfilesEnabled() };
}
function callbackUri(req: Request) {
  const publicOrigin = localOrigin(req);
  const target = new URL(process.env.GOOGLE_REDIRECT_URI || CALLBACK_PATH, publicOrigin);
  if (!/^https?:$/.test(target.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || target.pathname !== CALLBACK_PATH || target.search || target.hash || target.origin !== publicOrigin) {
    throw new HttpError(503, "Google sign-in must use the configured local callback address.");
  }
  return target.href;
}
function googleClient(redirectUri: string) {
  if (!googleConfigured()) throw new HttpError(503, "Google sign-in is not configured on this Mac yet.");
  return new OAuth2Client({ clientId: process.env.GOOGLE_CLIENT_ID!.trim(), clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(), redirectUri, transporterOptions: { timeout: 15_000, retry: false } });
}
function flowCookie(value: string, req: Request, seconds = 600) {
  return `${FLOW_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${seconds}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
/** Callback is the sole cross-site exception: it must be a local GET with a bound, one-use state cookie. */
function assertCallbackHost(req: Request) {
  localOrigin(req);
  if (req.method !== "GET" || new URL(req.url).pathname !== CALLBACK_PATH) throw new HttpError(403, "Invalid Google sign-in callback.");
}
export async function startGoogle(req: Request) {
  const redirectUri = callbackUri(req), client = googleClient(redirectUri);
  await rateLimit("google-start", 30);
  const state = randomBytes(32).toString("base64url"), nonce = randomBytes(32).toString("base64url");
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  await (await getRepository()).auth.saveOAuth({ stateHash: hashToken(state), verifier: codeVerifier, nonce, redirectUri, expiresAt: Date.now() + 600_000 });
  const url = client.generateAuthUrl({ scope: GOOGLE_SCOPES, state, nonce, code_challenge: codeChallenge, code_challenge_method: CodeChallengeMethod.S256, access_type: "online", prompt: "select_account" });
  return new Response(null, { status: 302, headers: { location: url, "set-cookie": flowCookie(state, req), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
export function validatedGoogleProfile(payload: TokenPayload | undefined, nonce: string) {
  // Signature/audience/issuer/expiry are verified first by Google's SDK.
  if (!payload || typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255 || !payload.email || payload.email.length > 254 || payload.email_verified !== true || (payload as TokenPayload & { nonce?: string }).nonce !== nonce) throw new HttpError(401, "Google could not verify this sign-in. Please try again.");
  return { subject: payload.sub, email: payload.email.trim().toLowerCase(), displayName: (payload.name?.trim() || "Learner").slice(0, 60) };
}
export async function finishGoogle(req: Request) {
  assertCallbackHost(req);
  const url = new URL(req.url), received = url.searchParams.get("state"), expected = cookieValue(req, FLOW_COOKIE);
  const failure = (code: string) => new Response(null, { status: 303, headers: { location: `/login?error=${code}`, "set-cookie": flowCookie("", req, 0), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  if (!received || !expected || !/^[A-Za-z0-9_-]{43}$/.test(received) || received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return failure("google_state");
  const repo = await getRepository(), transaction = await repo.auth.consumeOAuth(hashToken(received));
  if (!transaction) return failure("google_expired");
  if (url.searchParams.has("error")) return failure("google_cancelled");
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096 || transaction.redirectUri !== callbackUri(req)) return failure("google_invalid");
  try {
    const client = googleClient(transaction.redirectUri);
    const { tokens } = await client.getToken({ code, codeVerifier: transaction.verifier, redirect_uri: transaction.redirectUri });
    if (!tokens.id_token) return failure("google_invalid");
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID!.trim() });
    const profile = validatedGoogleProfile(ticket.getPayload(), transaction.nonce);
    const account = await repo.auth.googleAccount(profile.subject) ?? await repo.auth.createGoogleAccount(profile);
    // Do not retain Google access/refresh/ID tokens. They are not needed for learning.
    const headers = new Headers({ location: "/", "cache-control": "no-store", "referrer-policy": "no-referrer" });
    headers.append("set-cookie", await issueSession(account, req));
    headers.append("set-cookie", flowCookie("", req, 0));
    headers.append("set-cookie", "further_local_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    return new Response(null, { status: 303, headers });
  } catch (error) {
    return failure(error instanceof AccountConflict ? "google_account_exists" : "google_failed");
  }
}
