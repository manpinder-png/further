"use client";
// Client state. The event log is the source of truth: node interest/mastery/state
// are replayed from it with lib/math.ts (plan §5.4), exactly like the time-lapse.
// Every count shown in the UI (map, rail, profile) comes from useMapStats() below.
// Local mode hydrates durable server state; browser storage is reserved for the
// explicitly selected sample map. A failed write remains retryable in this tab.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { AgentName, Concept, Edge, EventKind, Explorer, FEvent, LogEntry, MatchRequest, UserNode } from "../types";
import { replay } from "../math";
import { pathFor, progressFor, suggestNext } from "../insight";
import { CATALOG, CATALOG_EDGES, DEMO_PROFILE, START_SLUGS, seedEvents, seedExplorers } from "../demo/seed";
import { placeNear } from "../layout";
import type { SystemStatus } from "../server/config";
import { getDataMode, hydrateLive, liveFetch, localIdentity, persistEvent, setExpectedActor, MODE_KEY, IDENTITY_CHANGE_KEY, MAP_RESET_KEY } from "./live";
import type { DataMode, MapSnapshot, LocalProfile, Mission } from "@/domains/ui/contracts";
import { errorMessage, mutationKey, mergeMissions } from "@/domains/ui/contracts";
import type { AuthSession } from "@/lib/auth-contracts";
export type { Mission } from "@/domains/ui/contracts";

/** Plain-language activity that isn't a map event (e.g. a match). */
export interface Note {
  at: number;
  text: string;
}

export interface SessionResult {
  id?: string;
  peer: string;
  concepts: string[];
  summary: string[];
  at: number;
}

interface State {
  auth: AuthSession | null;
  authReady: boolean;
  peerNames: Record<string, string>;
  ready: boolean;
  actorId: string | null;
  dataMode: DataMode;
  modelMode: "live" | "fixture";
  loadingError: string | null;
  saveError: string | null;
  pendingWrites: number;
  currentSessionId: string | null;
  concepts: Record<string, Concept>;
  edges: Edge[];
  events: FEvent[];
  selected: string | null;
  log: LogEntry[];
  missions: Mission[];
  explorers: Explorer[];
  match: MatchRequest | null;
  profile: LocalProfile;
  status: SystemStatus | null;
  sessions: SessionResult[];
  notes: Note[];
  fitKey: number;
  /** Suggested topics the learner said "not now" to. */
  dismissed: string[];
}

type Action =
  | { t: "auth"; auth: AuthSession }
  | { t: "authError"; error: string }
  | { t: "signedOut" }
  | { t: "hydrate"; now: number; saved?: Saved | null }
  | { t: "hydrateLive"; snapshot: MapSnapshot }
  | { t: "loadError"; error: string }
  | { t: "saveError"; error: string | null }
  | { t: "pending"; delta: number }
  | { t: "presence"; explorers: Explorer[]; match?: MatchRequest | null }
  | { t: "concept"; c: Concept; edge?: Edge }
  | { t: "edge"; e: Edge }
  | { t: "event"; slug: string; kind: EventKind; payload?: Record<string, unknown> }
  | { t: "select"; slug: string | null }
  | { t: "log"; e: Omit<LogEntry, "id" | "at"> }
  | { t: "mission"; m: Mission }
  | { t: "missionPatch"; id: number; patch: Partial<Mission> }
  | { t: "match"; m: MatchRequest | null }
  | { t: "profile"; p: Partial<LocalProfile> }
  | { t: "status"; s: SystemStatus }
  | { t: "session"; r: SessionResult }
  | { t: "note"; text: string }
  | { t: "dismiss"; slug: string }
  | { t: "fit" };

const SAVE_KEY = "further:map:v1";
type Saved = Pick<State, "concepts" | "edges" | "events" | "missions" | "sessions" | "notes" | "profile"> & { dismissed?: string[] };
function load(): Saved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
function save(s: State) {
  try {
    const { concepts, edges, events, missions, sessions, notes, profile, dismissed } = s;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ concepts, edges, events, missions: missions.filter((m) => m.status !== "running"), sessions, notes, profile, dismissed }));
  } catch { /* storage blocked: map still works for this tab */ }
}

let logId = 1;
let evId = 10_000;

const initial: State = {
  auth: null,
  authReady: false,
  peerNames: {},
  ready: false,
  actorId: null,
  dataMode: "local",
  modelMode: "live",
  loadingError: null,
  saveError: null,
  pendingWrites: 0,
  currentSessionId: null,
  concepts: {},
  edges: [],
  events: [],
  selected: null,
  log: [],
  missions: [],
  explorers: [],
  match: null,
  profile: DEMO_PROFILE,
  status: null,
  sessions: [],
  notes: [],
  fitKey: 0,
  dismissed: [],
};

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "auth": {
      const changed = s.auth?.account?.learnerId !== a.auth.account?.learnerId;
      const signedOut = !a.auth.authenticated && !a.auth.localProfilesEnabled;
      return { ...(changed || signedOut ? { ...initial, status: s.status } : s), auth: a.auth, authReady: true, ...(signedOut ? { ready: true } : {}) };
    }
    case "authError": return { ...s, authReady: true, loadingError: a.error };
    case "signedOut": return { ...initial, ready: true, authReady: true, auth: s.auth ? { ...s.auth, authenticated: false, account: null } : null, status: s.status };
    case "hydrate": {
      const explorers = seedExplorers(a.now);
      s = { ...s, dataMode: "demo", loadingError: null };
      if (a.saved?.events?.length) {
        evId = Math.max(evId, ...a.saved.events.map((e) => e.id + 1));
        return {
          ...s,
          ...a.saved,
          dismissed: a.saved.dismissed ?? [],
          ready: true,
          explorers,
          log: [{ id: logId++, at: a.now, agent: "SYSTEM", msg: `Restored map from this browser (${a.saved.events.length} events)`, level: "info" }],
        };
      }
      const concepts: Record<string, Concept> = {};
      for (const slug of START_SLUGS) concepts[slug] = { ...CATALOG[slug] };
      return {
        ...s,
        ready: true,
        concepts,
        edges: CATALOG_EDGES,
        events: seedEvents(a.now),
        explorers,
        log: [{ id: logId++, at: a.now, agent: "SYSTEM", msg: "Loaded 7 days of map history (seed data)", level: "info", demo: true }],
      };
    }
    case "hydrateLive": {
      // Tile coordinates are presentation-only, so keep them client-side and
      // deterministically rebuild them from the persisted graph after reload.
      const placed: Concept[] = [];
      const remaining = [...a.snapshot.concepts];
      let deferred = 0;
      while (remaining.length) {
        const next = remaining.shift()!;
        const parentSlug = a.snapshot.edges.find((e) => e.dst === next.slug)?.src;
        const parent = placed.find((c) => c.slug === parentSlug);
        if (parentSlug && !parent && remaining.some((c) => c.slug === parentSlug) && deferred < remaining.length) {
          remaining.push(next);
          deferred++;
          continue;
        }
        placed.push({ ...next, ...placeNear(next.slug, parent?.x !== undefined ? { x: parent.x, y: parent.y! } : undefined, placed) });
        deferred = 0;
      }
      if (a.snapshot.events.length) evId = Math.max(evId, ...a.snapshot.events.map((e) => e.id + 1));
      return {
        ...s,
        ready: true,
        concepts: Object.fromEntries(placed.map((c) => [c.slug, c])),
        edges: a.snapshot.edges,
        events: a.snapshot.events,
        peerNames: a.snapshot.peerNames ?? {},
        sessions: a.snapshot.sessions ? a.snapshot.sessions.filter(room => room.endedAt).map(room => ({id: room.id, peer: room.participants.find(id => id !== a.snapshot.actorId) ?? "a peer", concepts: [room.conceptSlug], summary: room.summary, at: room.endedAt ?? room.createdAt})) : s.sessions,
        actorId: a.snapshot.actorId ?? s.actorId,
        dataMode: "local",
        modelMode: a.snapshot.modelMode ?? s.modelMode,
        loadingError: null,
        explorers: a.snapshot.explorers ?? s.explorers,
        match: a.snapshot.match === undefined ? s.match : a.snapshot.match,
        currentSessionId: a.snapshot.currentSessionId ?? null,
        missions: a.snapshot.missions === undefined ? s.missions : mergeMissions(s.missions, a.snapshot.missions),
        profile: a.snapshot.profile ?? s.profile,
        log: s.ready ? s.log : [{ id: logId++, at: Date.now(), agent: "SYSTEM", msg: "Loaded your persisted learning map", level: "ok" }],
      };
    }
    case "loadError": return { ...s, loadingError: a.error };
    case "saveError": return { ...s, saveError: a.error };
    case "pending": return { ...s, pendingWrites: Math.max(0, s.pendingWrites + a.delta) };
    case "presence": return { ...s, explorers: a.explorers, match: a.match === undefined ? s.match : a.match };
    case "concept":
      return {
        ...s,
        concepts: { ...s.concepts, [a.c.slug]: a.c },
        edges: a.edge && !s.edges.some((e) => e.src === a.edge!.src && e.dst === a.edge!.dst) ? [...s.edges, a.edge] : s.edges,
      };
    case "edge":
      return s.edges.some((e) => e.src === a.e.src && e.dst === a.e.dst) ? s : { ...s, edges: [...s.edges, a.e] };
    case "event":
      return { ...s, events: [...s.events, { id: evId++, slug: a.slug, kind: a.kind, payload: a.payload, at: Date.now() }] };
    case "select":
      return { ...s, selected: a.slug };
    case "log":
      return { ...s, log: [...s.log.slice(-199), { ...a.e, id: logId++, at: Date.now() }] };
    case "mission":
      return { ...s, missions: [a.m, ...s.missions] };
    case "missionPatch":
      return { ...s, missions: s.missions.map((m) => (m.id === a.id ? { ...m, ...a.patch } : m)) };
    case "match":
      return { ...s, match: a.m };
    case "profile":
      return { ...s, profile: { ...s.profile, ...a.p } };
    case "status":
      return { ...s, status: a.s };
    case "session":
      return { ...s, sessions: [a.r, ...s.sessions] };
    case "note":
      return { ...s, notes: [...s.notes.slice(-49), { at: Date.now(), text: a.text }] };
    case "dismiss":
      return s.dismissed.includes(a.slug) ? s : { ...s, dismissed: [...s.dismissed, a.slug] };
    case "fit":
      return { ...s, fitKey: s.fitKey + 1 };
  }
}

interface Ctx extends State {
  nodes: Record<string, UserNode>;
  dispatch: React.Dispatch<Action>;
  log: LogEntry[];
  say: (agent: AgentName, msg: string, level?: LogEntry["level"], demo?: boolean) => void;
  track: (slug: string, kind: EventKind, payload?: Record<string, unknown>) => Promise<boolean>;
  refreshSnapshot: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  retryPendingWrites: () => Promise<void>;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const boot = useRef(false);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === MODE_KEY || event.key === IDENTITY_CHANGE_KEY || event.key === MAP_RESET_KEY) window.location.reload();
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  const current = useRef(state);
  current.current = state;
  const refreshing = useRef<Promise<void> | null>(null);
  const session = useRef<AuthSession | null>(null);
  const identityGeneration = useRef(0);
  const authSequence = useRef(0);
  const authApplied = useRef(0);
  const legacyIdentityReady = useRef(false);
  const readAuth = useCallback(async () => {
    const sequence = ++authSequence.current;
    const response = await liveFetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) throw new Error("We couldn't check your sign-in. Please retry.");
    const next: AuthSession = await response.json();
    if (sequence < authApplied.current) return session.current ?? { ...next, authenticated: false, account: null };
    authApplied.current = sequence;
    if (session.current?.account?.learnerId !== next.account?.learnerId) {
      identityGeneration.current++;
      failedWrites.current.clear();
    }
    // Google returns through a full-page redirect. Broadcast the identity change
    // here too, so already-open tabs cannot keep another account's private view.
    try {
      const markerKey = "further:account-marker:v1";
      const marker = next.account?.learnerId ?? "signed-out";
      if (localStorage.getItem(markerKey) !== marker) {
        localStorage.setItem(markerKey, marker);
        localStorage.setItem(IDENTITY_CHANGE_KEY, mutationKey());
      }
    } catch { /* Storage-disabled browsers still use the server session. */ }
    session.current = next;
    setExpectedActor(next.account?.learnerId ?? null);
    dispatch({ t: "auth", auth: next });
    return next;
  }, []);
  const refreshRequested = useRef(0);
  const refreshSnapshot = useCallback(async () => {
    refreshRequested.current++;
    if (refreshing.current) return refreshing.current;
    const request = (async () => {
      const auth = session.current ?? await readAuth();
      if (!auth.authenticated) {
        if (!auth.localProfilesEnabled) return;
        if (!legacyIdentityReady.current) { const identity = await localIdentity(); setExpectedActor(identity.actorId); legacyIdentityReady.current = true; }
      }
      // A mutation completed during an older read needs a fresh trailing read.
      // Resolve all callers only after the newest requested snapshot is applied.
      let completed = 0;
      while (completed < refreshRequested.current) {
        if (!session.current?.authenticated && !session.current?.localProfilesEnabled) return;
        const requested = refreshRequested.current;
        const generation = identityGeneration.current;
        if (getDataMode() === "demo") {
          dispatch({ t: "hydrate", now: Date.now(), saved: load() });
        } else {
          const snapshot = await hydrateLive();
          if (generation !== identityGeneration.current) continue;
          if (session.current?.account && snapshot.actorId !== session.current.account.learnerId) {
            // A cookie changed in another tab while this fetch was in flight.
            await readAuth();
            if (session.current?.account && snapshot.actorId !== session.current.account.learnerId) throw new Error("Your saved data could not be matched to this account. Please reload.");
            continue;
          }
          dispatch({ t: "hydrateLive", snapshot });
        }
        completed = requested;
      }
    })()
      .catch((error) => {
        legacyIdentityReady.current = false;
        if (session.current?.authenticated || session.current?.localProfilesEnabled) dispatch({ t: "loadError", error: errorMessage(error, "Your map couldn't load. Your saved data has not been replaced.") });
        throw error;
      })
      .finally(() => { refreshing.current = null; });
    refreshing.current = request;
    return request;
  }, [readAuth]);

  const refreshAuth = useCallback(async () => {
    try {
      await readAuth();
      await refreshSnapshot();
    } catch (error) {
      dispatch({ t: "authError", error: errorMessage(error, "We couldn't check your sign-in. Please retry.") });
      throw error;
    }
  }, [readAuth, refreshSnapshot]);

  useEffect(() => {
    const expired = () => {
      identityGeneration.current++;
      session.current = null;
      authApplied.current = ++authSequence.current;
      setExpectedActor(null);
      legacyIdentityReady.current = false;
      failedWrites.current.clear();
      dispatch({ t: "signedOut" });
    };
    window.addEventListener("further:unauthorized", expired);
    return () => window.removeEventListener("further:unauthorized", expired);
  }, []);

  useEffect(() => {
    if (boot.current) return;
    boot.current = true;
    void refreshAuth().catch(() => undefined);
    liveFetch("/api/health")
      .then((r) => r.json())
      .then((s: SystemStatus) => dispatch({ t: "status", s }))
      .catch(() => dispatch({ t: "log", e: { agent: "SYSTEM", msg: "Health check unavailable", level: "warn" } }));
  }, [refreshAuth]);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible") void refreshAuth().catch(() => undefined);
    };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [refreshAuth]);

  // Rehearsal data remains separate from durable local users.
  useEffect(() => {
    if (!state.ready || state.dataMode !== "demo") return;
    const t = setTimeout(() => save(state), 300);
    return () => clearTimeout(t);
  }, [state]);

  // Heartbeats are independent of learning or requesting a match.
  useEffect(() => {
    if (!state.ready || state.dataMode !== "local" || (!state.auth?.authenticated && !state.auth?.localProfilesEnabled)) return;
    let alive = true;
    const heartbeat = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const now = current.current;
        const snapshot = replay(now.events);
        const r = await liveFetch("/api/local/presence", {
          method: "POST",
          body: JSON.stringify({
            activeConcepts: Object.values(snapshot).sort((a, b) => b.interest - a.interest).slice(0, 5).map((n) => n.slug),
            mastery: Object.fromEntries(Object.values(snapshot).map((n) => [n.slug, n.mastery])),
            language: now.profile.language,
            openToMatch: now.profile.openToMatch,
            availableMinutes: now.profile.availableMinutes ?? 10,
          }),
        });
        if (!r.ok) return;
        const d = await r.json();
        if (alive && Array.isArray(d.explorers)) dispatch({ t: "presence", explorers: d.explorers, match: d.match });
      } catch { /* The next heartbeat retries; do not manufacture peers. */ }
    };
    void heartbeat();
    const interval = setInterval(heartbeat, 10_000);
    const visible = () => { if (document.visibilityState === "visible") void heartbeat(); };
    document.addEventListener("visibilitychange", visible);
    return () => { alive = false; clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, [state.ready, state.dataMode, state.profile.openToMatch, state.auth]);

  const nodes = useMemo(() => replay(state.events), [state.events]);
  const say = useCallback<Ctx["say"]>((agent, msg, level = "info", demo) => dispatch({ t: "log", e: { agent, msg, level, demo } }), []);
  // Writes stay in order so rapid actions cannot race a later snapshot.
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  type PendingEvent = { slug: string; kind: EventKind; payload?: Record<string, unknown>; key: string; actorId: string | null; generation: number };
  const failedWrites = useRef(new Map<string, PendingEvent>());
  const enqueue = useCallback((event: PendingEvent) => {
    dispatch({ t: "pending", delta: 1 });
    const write = writeQueue.current.then(async () => {
      try {
        if (event.generation !== identityGeneration.current || event.actorId !== current.current.actorId) {
          failedWrites.current.delete(event.key);
          return false;
        }
        await persistEvent(event.slug, event.kind, event.payload, event.key, event.actorId);
        if (event.generation !== identityGeneration.current) return false;
        failedWrites.current.delete(event.key);
        await refreshSnapshot();
        if (!failedWrites.current.size) dispatch({ t: "saveError", error: null });
        return true;
      } catch (error) {
        if (event.generation !== identityGeneration.current) return false;
        failedWrites.current.set(event.key, event);
        dispatch({ t: "saveError", error: errorMessage(error, "Your latest action couldn't be saved. Please retry it.") });
        return false;
      } finally {
        if (event.generation === identityGeneration.current) dispatch({ t: "pending", delta: -1 });
      }
    });
    writeQueue.current = write.then(() => undefined);
    return write;
  }, [refreshSnapshot]);
  const track = useCallback<Ctx["track"]>((slug, kind, payload) => {
    if (getDataMode() === "demo") {
      dispatch({ t: "event", slug, kind, payload });
      return Promise.resolve(true);
    }
    return enqueue({ slug, kind, payload, key: mutationKey(), actorId: current.current.actorId, generation: identityGeneration.current });
  }, [enqueue]);
  const retryPendingWrites = useCallback(async () => {
    for (const event of [...failedWrites.current.values()]) await enqueue(event);
  }, [enqueue]);

  const value = useMemo(() => ({ ...state, nodes, dispatch, say, track, refreshSnapshot, refreshAuth, retryPendingWrites }), [state, nodes, say, track, refreshSnapshot, refreshAuth, retryPendingWrites]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside StoreProvider");
  return c;
}

/** The one source for every count in the UI. Map, left rail and Profile all read this. */
export function useMapStats() {
  const { nodes, events, missions } = useStore();
  return useMemo(() => {
    const list = Object.values(nodes);
    const by = (st: string) => list.filter((n) => n.state === st).length;
    // A session writes one "session" event per concept; group them back into sessions.
    const sessionKeys = new Set(events.filter((e) => e.kind === "session").map((e) => String(e.payload?.sessionId ?? `${String(e.payload?.with ?? "")}|${Math.round(e.at / 60_000)}`)));
    return {
      concepts: list.length,
      understood: by("understood"),
      explored: by("explored"),
      onMap: by("seeded"),
      sessions: sessionKeys.size,
      quests: missions.length,
      ...progressFor(nodes),
    };
  }, [nodes, events, missions]);
}

/** Topics the map suggests next, from how you learn (lib/insight.ts). */
export function useSuggestions() {
  const { concepts, nodes, events, dismissed, ready } = useStore();
  return useMemo(() => (ready ? suggestNext(concepts, nodes, events, dismissed) : []), [concepts, nodes, events, dismissed, ready]);
}

/** The ordered "Your path" list. */
export function usePath() {
  const { concepts, edges, nodes, events } = useStore();
  const suggestions = useSuggestions();
  return useMemo(() => pathFor(concepts, edges, nodes, suggestions, Date.now(), events), [concepts, edges, nodes, suggestions, events]);
}
