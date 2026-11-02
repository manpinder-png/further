import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { createRepository } from "../domains/data/repository.ts";
import type { FurtherRepository } from "../domains/data/contracts.ts";
import type { PublicAccount } from "../lib/auth-contracts.ts";
import { hashPassword, hashToken, verifyPassword, SESSION_COOKIE } from "../domains/backend/auth.ts";
import { validatedGoogleProfile } from "../domains/backend/google-auth.ts";
import { assertLocalRequest, localOrigin } from "../domains/backend/http.ts";
import { sessionCookie } from "../domains/backend/identity.ts";
import { POST as signup } from "../app/api/auth/signup/route.ts";
import { POST as login } from "../app/api/auth/login/route.ts";
import { POST as logout } from "../app/api/auth/logout/route.ts";
import { GET as session } from "../app/api/auth/session/route.ts";
import { PATCH as accountUpdate } from "../app/api/auth/account/route.ts";
import { PATCH as profileUpdate } from "../app/api/data/profile/route.ts";
import { GET as identity, POST as chooseIdentity } from "../app/api/local/identity/route.ts";
import { GET as bootstrap } from "../app/api/data/bootstrap/route.ts";
import { GET as googleStart } from "../app/api/auth/google/start/route.ts";
import { GET as googleCallback } from "../app/api/auth/google/callback/route.ts";
import type { TokenPayload } from "google-auth-library";

const shared = globalThis as typeof globalThis & { __furtherLocalRepository?: Promise<FurtherRepository> };
const env = Object.fromEntries(["FURTHER_LOCAL_DIR", "FURTHER_ENABLE_LOCAL_PROFILES", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"].map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let repo: FurtherRepository, dir: string;
const password = "Synthetic verification password 42!";
function req(path: string, method = "GET", data?: unknown, cookie = "", extra: Record<string, string> = {}) {
  return new Request(`http://127.0.0.1:3000${path}`, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extra }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}
function cookieFrom(response: Response, name = SESSION_COOKIE) {
  const header = response.headers.getSetCookie().find(value => value.startsWith(name + "="));
  assert.ok(header, "A real session cookie must be returned");
  assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Lax/);
  return header.split(";")[0];
}
async function create(tag: string) {
  const response = await signup(req("/api/auth/signup", "POST", { email: `${tag}@example.test`, username: tag, displayName: `Test ${tag}`, password }));
  assert.equal(response.status, 200, await response.clone().text());
  return { cookie: cookieFrom(response), account: (await response.json()).account as PublicAccount };
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "further-auth-")); process.env.FURTHER_LOCAL_DIR = dir;
  process.env.FURTHER_ENABLE_LOCAL_PROFILES = "0";
  delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET; delete process.env.GOOGLE_REDIRECT_URI;
  repo = await createRepository(); shared.__furtherLocalRepository = Promise.resolve(repo);
  globalThis.fetch = async () => { throw new Error("No external network is allowed in auth tests"); };
});
after(async () => {
  delete shared.__furtherLocalRepository; globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  await repo.close(); await rm(dir, { recursive: true, force: true });
});

test("accounts: anonymous requests never auto-create or expose local personas", async () => {
  const result = await session(req("/api/auth/session"));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { authenticated: false, account: null, providers: { google: { configured: false } }, localProfilesEnabled: false });
  assert.equal((await identity(req("/api/local/identity"))).status, 401);
  assert.equal((await bootstrap(req("/api/data/bootstrap"))).status, 401);
  const id = randomUUID(); await repo.ensureUser(id, "Preserved synthetic user");
  assert.equal((await bootstrap(req("/api/data/bootstrap", "GET", undefined, sessionCookie(id).split(";")[0]))).status, 401);
  assert.equal((await chooseIdentity(req("/api/local/identity", "POST", { userId: id }))).status, 401);
});

test("local request origins accept Next loopback normalization but reject different ports and external hosts", async () => {
  const normalized = new Request("http://localhost:3000/api/auth/session", { headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" } });
  assert.doesNotThrow(() => assertLocalRequest(normalized));
  assert.equal(localOrigin(normalized), "http://127.0.0.1:3000");
  assert.equal((await session(normalized)).status, 200);
  for (const [url, host, origin] of [
    ["http://localhost:3000/api/auth/session", "127.0.0.1:4000", "http://127.0.0.1:4000"],
    ["http://attacker.example/api/auth/session", "127.0.0.1", "http://127.0.0.1"],
    ["http://localhost:3000/api/auth/session", "attacker.example:3000", "http://attacker.example:3000"],
    ["http://localhost:3000/api/auth/session", "127.0.0.1:3000", "http://localhost:3000"],
  ]) assert.throws(() => assertLocalRequest(new Request(url, { headers: { host, origin } })));
});

test("accounts: signup, owner isolation, profile editing, signout and returning sign-in", async () => {
  const a = await create("alice_auth"), b = await create("bob_auth");
  assert.notEqual(a.account.learnerId, b.account.learnerId); assert.equal(a.account.emailVerified, false);
  assert.equal("passwordHash" in a.account, false);
  const stored = await repo.auth.passwordCredential(a.account.email);
  assert.ok(stored); assert.match(stored.passwordHash, /^scrypt-v1:/); assert.equal(stored.passwordHash.includes(password), false);
  const graph = { slug: "private-alice-concept", title: "Alice's saved question", hook: "Only this account", domain: "ai-tech" };
  await repo.addConcepts(a.account.learnerId, [graph]);
  const ar = await (await bootstrap(req("/api/data/bootstrap", "GET", undefined, a.cookie))).json();
  const br = await (await bootstrap(req("/api/data/bootstrap", "GET", undefined, b.cookie))).json();
  assert.equal(ar.concepts[0].slug, graph.slug); assert.deepEqual(br.concepts, []);
  const staleHeader = { "x-further-actor": a.account.learnerId };
  assert.equal((await profileUpdate(req("/api/data/profile", "PATCH", { currentIntent: "Must not be saved to Bob" }, b.cookie, staleHeader))).status, 409);
  assert.equal((await repo.getProfile(b.account.learnerId)).currentIntent, "");
  assert.equal((await accountUpdate(req("/api/auth/account", "PATCH", { username: "must_not_change" }, b.cookie, staleHeader))).status, 409);
  assert.equal((await logout(req("/api/auth/logout", "POST", {}, b.cookie, staleHeader))).status, 409);
  assert.equal((await (await session(req("/api/auth/session", "GET", undefined, b.cookie))).json()).authenticated, true);
  const identityResponse = await (await identity(req("/api/local/identity", "GET", undefined, a.cookie))).json();
  assert.deepEqual(identityResponse.personas, []);
  const updated = await accountUpdate(req("/api/auth/account", "PATCH", { username: "alice_new", displayName: "Alice revised" }, a.cookie));
  assert.equal(updated.status, 200); assert.equal((await updated.json()).account.displayName, "Alice revised");
  assert.equal((await repo.getProfile(a.account.learnerId)).displayName, "Alice revised");
  assert.equal((await accountUpdate(req("/api/auth/account", "PATCH", { id: b.account.id, username: "stolen_user" }, a.cookie))).status, 400);
  assert.equal((await accountUpdate(req("/api/auth/account", "PATCH", { username: b.account.username }, a.cookie))).status, 409);
  assert.equal((await logout(req("/api/auth/logout", "POST", {}, a.cookie))).status, 200);
  assert.equal((await bootstrap(req("/api/data/bootstrap", "GET", undefined, a.cookie))).status, 401);
  const again = await login(req("/api/auth/login", "POST", { email: a.account.email.toUpperCase(), password }));
  assert.equal(again.status, 200); const newCookie = cookieFrom(again); assert.notEqual(newCookie, a.cookie);
  const restored = await (await bootstrap(req("/api/data/bootstrap", "GET", undefined, newCookie))).json();
  assert.equal(restored.actorId, a.account.learnerId); assert.equal(restored.concepts[0].slug, graph.slug);
});

test("accounts: CSRF, invalid credentials, duplicate signup and actor injection fail", async () => {
  assert.equal((await signup(req("/api/auth/signup", "POST", {}, "", { origin: "https://attacker.example" }))).status, 403);
  assert.equal((await login(req("/api/auth/login", "POST", {}, "", { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal((await logout(req("/api/auth/logout", "POST", {}, "", { origin: "http://127.0.0.1:4000" }))).status, 403);
  const wrong = await login(req("/api/auth/login", "POST", { email: "alice_auth@example.test", password: "Incorrect password!" }));
  const absent = await login(req("/api/auth/login", "POST", { email: "missing@example.test", password: "Incorrect password!" }));
  assert.equal(wrong.status, 401); assert.equal(absent.status, 401); assert.deepEqual(await wrong.json(), await absent.json());
  assert.equal((await signup(req("/api/auth/signup", "POST", { email: "alice_auth@example.test", username: "unrelated", displayName: "Duplicate", password }))).status, 409);
  assert.equal((await signup(req("/api/auth/signup", "POST", { email: "new@example.test", username: "new_user", displayName: "Injected", password, actorId: randomUUID() }))).status, 400);
  const hashed = await hashPassword(password); assert.equal(await verifyPassword(password, hashed), true); assert.equal(await verifyPassword("Wrong password", hashed), false);
  assert.equal(await verifyPassword(password, "unsafe-hash-format"), false);
  const key = "isolated-rate-limit";
  for (let i = 0; i < 3; i++) assert.equal((await repo.auth.attempt(key, 3, 60_000)).allowed, true);
  assert.equal((await repo.auth.attempt(key, 3, 60_000)).allowed, false);
});

test("accounts: even opt-in synthetic profile switching cannot impersonate a real account", async () => {
  const real = await create("real_not_persona");
  process.env.FURTHER_ENABLE_LOCAL_PROFILES = "1";
  try {
    const fresh = await identity(req("/api/local/identity")); assert.equal(fresh.status, 200);
    const value = await fresh.json(); assert.equal(value.personas.some((person: { id: string }) => person.id === real.account.learnerId), false);
    assert.equal((await chooseIdentity(req("/api/local/identity", "POST", { userId: real.account.learnerId }))).status, 403);
    assert.equal((await bootstrap(req("/api/data/bootstrap", "GET", undefined, sessionCookie(real.account.learnerId).split(";")[0]))).status, 401);
  } finally { process.env.FURTHER_ENABLE_LOCAL_PROFILES = "0"; }
});

test("Google: explicit unconfigured state; bound PKCE flow rejects forged, cancelled and replayed state", async () => {
  assert.equal((await googleStart(req("/api/auth/google/start"))).status, 503);
  process.env.GOOGLE_CLIENT_ID = "synthetic-client.apps.googleusercontent.com"; process.env.GOOGLE_CLIENT_SECRET = "synthetic-not-a-live-secret";
  try {
    const start = await googleStart(new Request("http://localhost:3000/api/auth/google/start", { headers: { host: "127.0.0.1:3000" } })); assert.equal(start.status, 302);
    const location = new URL(start.headers.get("location")!); assert.equal(location.hostname, "accounts.google.com");
    assert.equal(location.searchParams.get("scope"), "openid email profile"); assert.equal(location.searchParams.get("code_challenge_method"), "S256");
    assert.ok(location.searchParams.get("nonce")); assert.ok(location.searchParams.get("code_challenge"));
    assert.equal(location.searchParams.get("redirect_uri"), "http://127.0.0.1:3000/api/auth/google/callback");
    const state = location.searchParams.get("state")!, cookie = cookieFrom(start, "further_google_state");
    const missing = await googleCallback(req(`/api/auth/google/callback?state=${state}&code=unused`));
    assert.equal(missing.headers.get("location"), "/login?error=google_state");
    const cancelledPath = `/api/auth/google/callback?state=${state}&error=access_denied`;
    const cancelled = await googleCallback(req(cancelledPath, "GET", undefined, cookie, { "sec-fetch-site": "cross-site" }));
    assert.equal(cancelled.headers.get("location"), "/login?error=google_cancelled");
    assert.equal((await googleCallback(req(cancelledPath, "GET", undefined, cookie))).headers.get("location"), "/login?error=google_expired");
    const hostile = new Request(`http://attacker.example/api/auth/google/callback?state=${state}`, { headers: { host: "attacker.example", cookie } });
    assert.equal((await googleCallback(hostile)).status, 403);
  } finally { delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET; }
});

test("Google: verified claim checks, stable subject identity and no email-based account takeover", async () => {
  const valid = { sub: "google-subject-123", email: "gtest@example.test", email_verified: true, name: "Google learner", nonce: "expected-nonce" } as TokenPayload & { nonce: string };
  assert.equal(validatedGoogleProfile(valid, "expected-nonce").subject, valid.sub);
  assert.throws(() => validatedGoogleProfile(valid, "wrong-nonce"));
  assert.throws(() => validatedGoogleProfile({ ...valid, email_verified: false }, "expected-nonce"));
  const input = validatedGoogleProfile(valid, "expected-nonce"), one = await repo.auth.createGoogleAccount(input);
  const again = await repo.auth.googleAccount(input.subject); assert.equal(again?.learnerId, one.learnerId);
  assert.equal(one.emailVerified, true); assert.equal(one.provider, "google");
  await assert.rejects(repo.auth.createGoogleAccount({ ...input, subject: "different-subject", email: "alice_auth@example.test" }), /already registered/);
  const expiredToken = randomBytes(32).toString("base64url");
  await repo.auth.createSession(hashToken(expiredToken), one.id, Date.now() - 1000);
  assert.equal(await repo.auth.sessionAccount(hashToken(expiredToken)), null);
});

test("accounts migration preserves v1 synthetic learning and real credentials survive restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "further-auth-migration-")), dataDir = join(directory, "pg"), oldId = randomUUID();
  // Seed the historical schema using its actual SQL. Modern repository methods
  // intentionally require modern durable-index tables and must not bypass them.
  const legacy = await PGlite.create({dataDir,extensions:{vector}});
  try {
    await legacy.exec(await readFile(resolve("domains/data/migrations/001_local.sql"),"utf8"));
    await legacy.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at bigint NOT NULL)");
    const now=Date.now();
    await legacy.query("INSERT INTO schema_migrations(version,applied_at) VALUES(1,$1) ON CONFLICT DO NOTHING",[now]);
    await legacy.query("INSERT INTO learners(id,display_name,created_at,updated_at) VALUES($1,$2,$3,$3)",[oldId,"Existing synthetic learner",now]);
    await legacy.query("INSERT INTO concepts(slug,title,hook,domain,created_at) VALUES('migration-topic','Preserved topic','An old map','ai-tech',$1)",[now]);
    await legacy.query("INSERT INTO learner_concepts(learner_id,concept_slug,created_at) VALUES($1,'migration-topic',$2)",[oldId,now]);
    await legacy.query("INSERT INTO learning_events(learner_id,concept_slug,kind,idempotency_key,occurred_at) VALUES($1,'migration-topic','seed','seed:migration-topic',$2)",[oldId,now]);
  } finally { await legacy.close(); }
  let data = await createRepository({ dataDir });
  try {
    assert.equal((await data.getSnapshot(oldId)).concepts[0].slug, "migration-topic");
    const account = await data.auth.createPasswordAccount({ email: "durable@example.test", username: "durable_user", displayName: "Durable", passwordHash: await hashPassword(password) });
    const token = hashToken(randomBytes(32).toString("hex")); await data.auth.createSession(token, account.id, Date.now() + 60_000);
    await data.close(); data = await createRepository({ dataDir });
    assert.equal((await data.auth.sessionAccount(token))?.learnerId, account.learnerId);
    assert.equal(await verifyPassword(password, (await data.auth.passwordCredential(account.email))!.passwordHash), true);
    assert.equal((await data.getSnapshot(oldId)).concepts[0].slug, "migration-topic");
    assert.equal((await data.listLocalUsers()).some(user => user.id === account.learnerId), false);
  } finally { await data.close(); await rm(directory, { recursive: true, force: true }); }
});
