import "server-only";
import { env } from "./config";

/** Small fetch-based Supabase boundary. Keeping this dependency-free lets the
 * starter stay runnable while still using real Auth/PostgREST when configured. */
export const hasSupabase = () => !!env.supabaseUrl && !!env.supabaseService && !!env.supabaseAnon;

function headers(token?: string, prefer?: string) {
  return {
    apikey: env.supabaseAnon || env.supabaseService,
    authorization: `Bearer ${token ?? env.supabaseService}`,
    "content-type": "application/json",
    ...(prefer ? { prefer } : {}),
  };
}

export async function requireSupabaseUser(req: Request): Promise<{ id: string; token: string }> {
  if (!hasSupabase()) throw new Error("Supabase is not configured");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in is required");
  const res = await fetch(`${env.supabaseUrl}/auth/v1/user`, { headers: headers(token) });
  if (!res.ok) throw new Error("Invalid session");
  const user = await res.json() as { id?: string };
  if (!user.id) throw new Error("Invalid session");
  return { id: user.id, token };
}

export async function adminRest(path: string, init: RequestInit = {}) {
  if (!hasSupabase()) throw new Error("Supabase is not configured");
  const mergedHeaders = new Headers(headers());
  new Headers(init.headers).forEach((value, key) => mergedHeaders.set(key, value));
  const res = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: mergedHeaders,
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Supabase REST ${res.status}`);
  return res;
}

export async function userRpc(token: string, name: string, args: Record<string, unknown>) {
  if (!hasSupabase()) throw new Error("Supabase is not configured");
  const res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Supabase RPC ${res.status}`);
  return res.json();
}
