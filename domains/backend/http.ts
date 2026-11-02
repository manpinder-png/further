import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** The development server is deliberately loopback-only; no cloud auth implied. */
export function assertLocalRequest(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("host") ?? url.host;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) throw new HttpError(403, "This development service accepts local requests only.");
  const origin = req.headers.get("origin");
  if (origin && origin !== `${url.protocol}//${host}`) throw new HttpError(403, "Cross-origin requests are not allowed.");
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Cross-site requests are not allowed.");
}

export function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(value, { status, headers: { "cache-control": "no-store", ...headers } });
}

export async function body(req: Request, limit = 100_000) {
  if (Number(req.headers.get("content-length") ?? 0) > limit) throw new HttpError(413, "Request is too large.");
  const raw = await req.text();
  if (Buffer.byteLength(raw) > limit) throw new HttpError(413, "Request is too large.");
  try { return JSON.parse(raw); } catch { throw new HttpError(400, "Expected a JSON request."); }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  if (err instanceof ZodError) return json({ error: "Please check the supplied fields.", issues: err.issues.map(i => ({ path: i.path, message: i.message })) }, 400);
  const e = err as { name?: string; message?: string; code?: string };
  if (e.name === "DataError") return json({ error: e.message, code: e.code }, e.code === "NOT_FOUND" ? 404 : e.code === "DATABASE_LOCKED" ? 503 : 409);
  if (e.name === "AgentError") return json({ error: e.message, code: e.code }, e.code === "INVALID_INPUT" ? 400 : e.code === "CANCELLED" ? 499 : e.code === "BUDGET_EXCEEDED" ? 429 : 502);
  // Never return provider bodies, database details or secrets to a browser.
  console.error("[further] request failed", e.name ?? "Error");
  return json({ error: "That action could not finish. Please try again." }, 500);
}

export async function handle(req: Request, fn: () => Promise<Response>) {
  try { assertLocalRequest(req); return await fn(); } catch (err) { return errorResponse(err); }
}

export function idempotencyKey(req: Request, fallback: string) {
  const key = req.headers.get("idempotency-key") ?? fallback;
  if (!/^[A-Za-z0-9:_.-]{1,160}$/.test(key)) throw new HttpError(400, "Invalid idempotency key.");
  return key;
}
