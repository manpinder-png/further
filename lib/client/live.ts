"use client";

// Anonymous Supabase auth gives the MVP a real auth.uid() without asking a
// first-time explorer to create an account before they can try the map. Enable
// Anonymous Sign-Ins in Supabase Auth; if it is disabled, callers fall back to
// the visibly labelled demo path.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const STORAGE = "further.supabase.session.v1";

type Session = { access_token: string; refresh_token?: string; expires_at?: number };

function saved(): Session | null {
  try { return JSON.parse(localStorage.getItem(STORAGE) ?? "null") as Session | null; } catch { return null; }
}

function save(session: Session) { localStorage.setItem(STORAGE, JSON.stringify(session)); }

export function liveConfigured() { return Boolean(URL && KEY); }

export async function accessToken(): Promise<string | null> {
  if (!URL || !KEY) return null;
  const current = saved();
  if (current?.access_token && (!current.expires_at || current.expires_at * 1000 > Date.now() + 60_000)) return current.access_token;
  const res = await fetch(`${URL}/auth/v1/token?grant_type=anonymous`, {
    method: "POST",
    headers: { apikey: KEY, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) return null;
  const next = await res.json() as Session;
  if (!next.access_token) return null;
  save(next);
  return next.access_token;
}

async function api(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  if (!token) throw new Error("Live account unavailable");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("content-type", "application/json");
  const res = await fetch(path, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function liveFetch(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  if (!token) throw new Error("Live account unavailable");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("content-type", "application/json");
  return fetch(path, {
    ...init,
    headers,
  });
}

export const hydrateLive = () => api("/api/data/bootstrap");
export const persistEvent = (slug: string, kind: string, payload?: Record<string, unknown>) =>
  api("/api/data/events", { method: "POST", body: JSON.stringify({ slug, kind, payload }) });
export const persistConcept = (concept: { slug: string; title: string; hook: string; domain: "ai-tech" }, edge?: { from: string; kind: string }) =>
  api("/api/data/concepts", { method: "POST", body: JSON.stringify({ concept, edge }) });
export const persistProfile = (profile: object) =>
  api("/api/data/profile", { method: "PATCH", body: JSON.stringify(profile) });
