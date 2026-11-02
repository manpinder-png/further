import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getRepository } from "../data/repository";
import { cookieValue, hashToken, rateLimit } from "./auth";
import { cognitoIdentityResponse } from "./cognito-auth";
import { cognitoConfig } from "./cognito-config";
import { HttpError, localOrigin } from "./http";

const FLOW_COOKIE = "further_cognito_state";
const CALLBACK_PATH = "/api/auth/cognito/callback";
function callbackUri(req: Request) { return new URL(CALLBACK_PATH, localOrigin(req)).href; }
function flowCookie(value: string, req: Request, seconds = 600) { return `${FLOW_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/cognito; Max-Age=${seconds}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`; }
function redirect(location: string, req: Request, error?: string) { return new Response(null, { status: 303, headers: { location: error ? `/login?error=${error}` : location, "set-cookie": flowCookie("", req, 0), "cache-control": "no-store", "referrer-policy": "no-referrer" } }); }

export async function startCognito(req: Request) {
  const config = cognitoConfig();
  if (!config.domain) throw new HttpError(503, "AWS hosted sign-in is not configured yet.");
  const provider = new URL(req.url).searchParams.get("provider");
  if (provider && provider !== "Facebook") throw new HttpError(400, "Choose a supported sign-in provider.");
  if (provider === "Facebook" && !config.facebookConfigured) throw new HttpError(503, "Facebook sign-in needs its app configuration before it can be used.");
  await rateLimit("cognito-start", 30);
  const state = randomBytes(32).toString("base64url"), nonce = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url");
  const redirectUri = callbackUri(req);
  await (await getRepository()).auth.saveOAuth({ stateHash: hashToken(state), verifier, nonce, redirectUri, expiresAt: Date.now() + 600_000 });
  const url = new URL("/oauth2/authorize", config.domain);
  url.search = new URLSearchParams({ response_type: "code", client_id: config.clientId, redirect_uri: redirectUri, scope: "openid email profile", state, nonce, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", ...(provider ? { identity_provider: provider } : {}) }).toString();
  return new Response(null, { status: 302, headers: { location: url.href, "set-cookie": flowCookie(state, req), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

/** Cognito alone navigates cross-site here; a one-use browser-bound state and PKCE authorize the exchange. */
export async function finishCognito(req: Request) {
  localOrigin(req);
  if (req.method !== "GET" || new URL(req.url).pathname !== CALLBACK_PATH) throw new HttpError(403, "Invalid AWS sign-in callback.");
  const url = new URL(req.url), received = url.searchParams.get("state"), expected = cookieValue(req, FLOW_COOKIE);
  if (!received || !expected || !/^[A-Za-z0-9_-]{43}$/.test(received) || received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return redirect("/login", req, "cognito_state");
  const transaction = await (await getRepository()).auth.consumeOAuth(hashToken(received));
  if (!transaction) return redirect("/login", req, "cognito_expired");
  if (url.searchParams.has("error")) return redirect("/login", req, "cognito_cancelled");
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096 || transaction.redirectUri !== callbackUri(req)) return redirect("/login", req, "cognito_invalid");
  try {
    const config = cognitoConfig();
    const response = await fetch(new URL("/oauth2/token", config.domain), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: config.clientId, code, redirect_uri: transaction.redirectUri, code_verifier: transaction.verifier }), cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return redirect("/login", req, "cognito_failed");
    const data = await response.json() as Record<string, unknown>;
    if (typeof data.id_token !== "string" || typeof data.access_token !== "string") return redirect("/login", req, "cognito_invalid");
    const signedIn = await cognitoIdentityResponse(req, { accessToken: data.access_token, idToken: data.id_token }, { nonce: transaction.nonce });
    const headers = new Headers(signedIn.headers);
    headers.delete("content-type"); headers.set("location", "/"); headers.set("referrer-policy", "no-referrer"); headers.append("set-cookie", flowCookie("", req, 0));
    return new Response(null, { status: 303, headers });
  } catch (error) { return redirect("/login", req, error instanceof HttpError && error.status === 409 ? "cognito_account_exists" : "cognito_failed"); }
}

export function cognitoLogoutUrl(req: Request) {
  const config = cognitoConfig();
  if (!config.domain) return undefined;
  const url = new URL("/logout", config.domain);
  url.search = new URLSearchParams({ client_id: config.clientId, logout_uri: new URL("/login", localOrigin(req)).href }).toString();
  return url.href;
}
