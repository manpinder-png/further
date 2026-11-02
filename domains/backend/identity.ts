import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getRepository } from "../data/repository";
import { assertLocalRequest, HttpError } from "./http";

const COOKIE = "further_local_session";
const SESSION_SECONDS = 7 * 24 * 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function secret() {
  const dir = resolve(process.env.FURTHER_LOCAL_DIR ?? ".local");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = resolve(dir, "session-secret");
  try { writeFileSync(path, randomBytes(48).toString("hex"), { mode: 0o600, flag: "wx" }); }
  catch (err) { if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err; }
  return readFileSync(path, "utf8");
}
function sign(payload: string) { return createHmac("sha256", secret()).update(payload).digest("base64url"); }

export function readActor(req: Request): string | null {
  const token = req.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  if (!token || token.length > 1024) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const { actorId, expires } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof actorId === "string" && UUID.test(actorId) && Number.isSafeInteger(expires) && expires > Date.now() ? actorId : null;
  } catch { return null; }
}

export function sessionCookie(actorId: string) {
  const payload = Buffer.from(JSON.stringify({ actorId, expires: Date.now() + SESSION_SECONDS * 1000 })).toString("base64url");
  return `${COOKIE}=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
}

export async function requireActor(req: Request) {
  assertLocalRequest(req);
  const actor = readActor(req);
  if (!actor) throw new HttpError(401, "Open your local profile first.");
  await (await getRepository()).getProfile(actor);
  return actor;
}

export async function identity(req: Request, action?: { userId?: string; displayName?: string }) {
  assertLocalRequest(req);
  const repo = await getRepository();
  let actorId = readActor(req);
  // Explicit persona switching is a loopback development tool, not production authentication.
  if (action?.userId) { await repo.getProfile(action.userId); actorId = action.userId; }
  else if (action?.displayName || !actorId) {
    actorId = randomUUID();
    await repo.ensureUser(actorId, action?.displayName ?? "Explorer");
  }
  const profile = await repo.getProfile(actorId!);
  const personas = await repo.listLocalUsers();
  return { value: { actorId: actorId!, profile, personas, mode: "local" as const }, cookie: sessionCookie(actorId!) };
}
