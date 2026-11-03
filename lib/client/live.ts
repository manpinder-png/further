"use client";

import type { DataMode, LocalIdentity, LocalProfile, MapSnapshot, RoomSnapshot } from "@/domains/ui/contracts";
import { mutationKey, writableProfile } from "@/domains/ui/contracts";

export const MODE_KEY = "further:data-mode:v2";
export const IDENTITY_CHANGE_KEY = "further:identity-change:v1";
export const MAP_RESET_KEY = "further:map-reset:v1";
let expectedActor: string | null = null;
/** A consistency check only. The server still obtains authority from its session. */
export const setExpectedActor = (actorId: string | null) => { expectedActor = actorId; };
export function getDataMode(): DataMode {
  if (typeof window === "undefined") return "local";
  try { return localStorage.getItem(MODE_KEY) === "demo" ? "demo" : "local"; } catch { return "local"; }
}
export function chooseDataMode(mode: DataMode) {
  localStorage.setItem(MODE_KEY, mode);
}
/** Kept as a compatibility seam; this now means persistent local data, not cloud configuration. */
export function liveConfigured() { return getDataMode() === "local"; }

export async function liveFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string") headers.set("content-type", "application/json");
  if (getDataMode() === "demo") headers.set("x-further-demo", "true");
  const mutation = (init.method ?? "GET").toUpperCase() !== "GET";
  const identityMutation = path === "/api/auth/account" || path === "/api/auth/logout";
  if (mutation && (!path.startsWith("/api/auth/") || identityMutation) && expectedActor && !headers.has("x-further-actor")) headers.set("x-further-actor", expectedActor);
  const response = await fetch(path, { ...init, credentials: "same-origin", headers });
  if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
    expectedActor = null;
    window.dispatchEvent(new Event("further:unauthorized"));
  }
  return response;
}

export async function localJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await liveFetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}
export const localIdentity = () => localJson<LocalIdentity>("/api/local/identity");
export const changeIdentity = async (selection: { displayName: string } | { userId: string }) => {
  const identity = await localJson<LocalIdentity>("/api/local/identity", { method: "POST", body: JSON.stringify(selection) });
  // The cookie changes for every tab in this browser. Clear their old actor view.
  try { localStorage.setItem(IDENTITY_CHANGE_KEY, mutationKey()); } catch { /* browser storage may be disabled */ }
  return identity;
};
export const hydrateLive = () => localJson<MapSnapshot>("/api/data/bootstrap");
export const persistEvent = (slug: string, kind: string, payload?: Record<string, unknown>, idempotencyKey = mutationKey(), actorId?: string | null) =>
  localJson("/api/data/events", { method: "POST", headers: { "idempotency-key": idempotencyKey, ...(actorId ? {"x-further-actor": actorId} : {}) }, body: JSON.stringify({ slug, kind, payload, idempotencyKey }) });
export const persistProfile = (profile: LocalProfile) =>
  localJson("/api/data/profile", { method: "PATCH", body: JSON.stringify(writableProfile(profile)) });
export const resetLearningMap = (idempotencyKey: string) =>
  localJson<{ ok: true }>("/api/data/reset", {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify({ confirmation: "RESET", idempotencyKey }),
  });
export const getRoom = (id: string) => localJson<RoomSnapshot>(`/api/local/sessions/${encodeURIComponent(id)}`);
