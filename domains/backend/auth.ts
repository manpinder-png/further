import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Account } from "../data/auth-contracts";
import { getRepository } from "../data/repository";
import { AccountConflict } from "../data/auth-store";
import { HttpError, json } from "./http";

export const SESSION_COOKIE = "further_account_session";
export const SESSION_SECONDS = 7 * 24 * 3600;
const PASSWORD_COST = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const email = z.string().trim().toLowerCase().email().max(254);
const username = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, "Use 3–24 letters, numbers or underscores.");
const displayName = z.string().trim().min(1).max(60);
const password = z.string().min(12, "Use at least 12 characters.").max(128);
export const SignupRequest = z.object({ email, username, displayName, password }).strict();
export const LoginRequest = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const AccountUpdate = z.object({ username: username.optional(), displayName: displayName.optional() }).strict().refine(value => Object.keys(value).length > 0, "Choose a field to update.");
export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
export const localProfilesEnabled = () => process.env.FURTHER_AUTH_PROVIDER !== "cognito" && process.env.FURTHER_DATA_BACKEND !== "aurora-data-api" && process.env.FURTHER_ENABLE_LOCAL_PROFILES === "1";

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, PASSWORD_COST, (error, value) => error ? reject(error) : resolve(value)));
}
export async function hashPassword(value: string) {
  const salt = randomBytes(16), key = await derive(value, salt);
  return `scrypt-v1:${salt.toString("hex")}:${key.toString("hex")}`;
}
export async function verifyPassword(value: string, encoded: string | null) {
  // Missing accounts take the same expensive path; no fast email-existence signal.
  const match = encoded?.match(/^scrypt-v1:([0-9a-f]{32}):([0-9a-f]{128})$/);
  const salt = Buffer.from(match?.[1] ?? "3bfc69e33f9096784bed4987468139fc00", "hex");
  const expected = Buffer.from(match?.[2] ?? "00".repeat(64), "hex");
  const actual = await derive(value, salt);
  return Boolean(match) && timingSafeEqual(actual, expected);
}
export function cookieValue(req: Request, name: string): string | null {
  return req.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(name + "="))?.slice(name.length + 1) ?? null;
}
export function accountCookie(token: string, req: Request, expiresAt?: number) {
  const seconds = expiresAt === undefined ? SESSION_SECONDS : Math.max(0, Math.min(SESSION_SECONDS, Math.floor((expiresAt - Date.now()) / 1000)));
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function clearAccountCookie(req: Request) {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function currentAccount(req: Request): Promise<Account | null> {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const account = await (await getRepository()).auth.sessionAccount(hashToken(token));
  if (process.env.FURTHER_AUTH_PROVIDER === "cognito") {
    if (!account || account.provider !== "cognito") return null;
    const { validateCognitoSession } = await import("./cognito-auth");
    if (!(await validateCognitoSession(req, account))) return null;
  }
  return account;
}
export async function requireAccount(req: Request) {
  const account = await currentAccount(req);
  if (!account) throw new HttpError(401, "Sign in to continue.");
  assertExpectedActor(req, account.learnerId);
  return account;
}
/** A stale-tab guard only. The header never authenticates or chooses an account. */
export function assertExpectedActor(req: Request, actorId: string | null) {
  const expected = req.headers.get("x-further-actor");
  if (expected !== null && expected !== actorId) throw new HttpError(409, "Your account changed. Reload before trying again.");
}
export async function revokeCurrentSession(req: Request) {
  const token = cookieValue(req, SESSION_COOKIE);
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) await (await getRepository()).auth.revokeSession(hashToken(token));
}
export async function issueSession(account: Account, req: Request, expiresAt?: number) {
  await revokeCurrentSession(req);
  const token = randomBytes(32).toString("base64url");
  const expiry = Math.min(expiresAt ?? Infinity, Date.now() + SESSION_SECONDS * 1000);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new HttpError(401, "Sign in again to continue.");
  await (await getRepository()).auth.createSession(hashToken(token), account.id, expiry);
  return accountCookie(token, req, expiry);
}
export async function signedInResponse(account: Account, req: Request, expiresAt?: number) {
  const headers = new Headers();
  headers.append("set-cookie", await issueSession(account, req, expiresAt));
  headers.append("set-cookie", "further_local_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
  return json({ authenticated: true, account }, 200, headers);
}
export async function rateLimit(key: string, limit = 10, windowMs = 10 * 60_000) {
  const result = await (await getRepository()).auth.attempt(hashToken(key), limit, windowMs);
  if (!result.allowed) throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(result.retryAfter / 60)} minutes.`);
}
export function accountError(error: unknown): never {
  if (error instanceof AccountConflict) throw new HttpError(409, error.message);
  throw error;
}
