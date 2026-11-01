"use client";
// Client state. The event log is the source of truth: node interest/mastery/state
// are replayed from it with lib/math.ts (plan §5.4), exactly like the time-lapse.
// Every count shown in the UI (map, rail, profile) comes from useMapStats() below.
// The learner's map is persisted to localStorage so a full page load keeps it.
// Production (Connor/Amit): hydrate from Supabase (`events`, `concepts`, `concept_edges`)
// and append events through an API route; Realtime keeps other devices in sync.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { AgentName, Concept, Edge, EventKind, Explorer, FEvent, LogEntry, MatchRequest, Profile, UserNode } from "../types";
import { replay } from "../math";
import { pathFor, progressFor, suggestNext } from "../insight";
import { CATALOG, CATALOG_EDGES, DEMO_PROFILE, START_SLUGS, seedEvents, seedExplorers } from "../demo/seed";
import type { SystemStatus } from "../server/config";

export interface Mission {
  id: number;
  text: string;
  source: "voice" | "text" | "mcp" | "lens";
  at: number;
  status: "running" | "done" | "error";
  intent?: string;
  added: number;
  reused: number;
  /** Topics this quest added, for quest progress. */
  slugs?: string[];
}

/** Plain-language activity that isn't a map event (e.g. a match). */
export interface Note {
  at: number;
  text: string;
}

export interface SessionResult {
  peer: string;
  concepts: string[];
  summary: string[];
  at: number;
}

interface State {
  ready: boolean;
  concepts: Record<string, Concept>;
  edges: Edge[];
  events: FEvent[];
  selected: string | null;
  log: LogEntry[];
  missions: Mission[];
  explorers: Explorer[];
  match: MatchRequest | null;
  profile: Profile;
  status: SystemStatus | null;
  sessions: SessionResult[];
  notes: Note[];
  fitKey: number;
  /** Left-pane drawer (phones). */
  rail: boolean;
  /** Suggested topics the learner said "not now" to. */
  dismissed: string[];
}

type Action =
  | { t: "hydrate"; now: number; saved?: Saved | null }
  | { t: "concept"; c: Concept; edge?: Edge }
  | { t: "edge"; e: Edge }
  | { t: "event"; slug: string; kind: EventKind; payload?: Record<string, unknown> }
  | { t: "select"; slug: string | null }
  | { t: "log"; e: Omit<LogEntry, "id" | "at"> }
  | { t: "mission"; m: Mission }
  | { t: "missionPatch"; id: number; patch: Partial<Mission> }
  | { t: "match"; m: MatchRequest | null }
  | { t: "profile"; p: Partial<Profile> }
  | { t: "status"; s: SystemStatus }
  | { t: "session"; r: SessionResult }
  | { t: "note"; text: string }
  | { t: "rail"; open: boolean }
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
  ready: false,
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
  rail: false,
  dismissed: [],
};

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "hydrate": {
      const explorers = seedExplorers(a.now);
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
    case "rail":
      return { ...s, rail: a.open };
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
  track: (slug: string, kind: EventKind, payload?: Record<string, unknown>) => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const boot = useRef(false);

  useEffect(() => {
    if (boot.current) return;
    boot.current = true;
    dispatch({ t: "hydrate", now: Date.now(), saved: load() });
    fetch("/api/health")
      .then((r) => r.json())
      .then((s: SystemStatus) => {
        dispatch({ t: "status", s });
        const demo = Object.entries(s).filter(([, v]) => v === "demo").map(([k]) => k);
        if (demo.length) dispatch({ t: "log", e: { agent: "SYSTEM", msg: `Demo mode for: ${demo.join(", ")}`, level: "warn" } });
      })
      .catch(() => dispatch({ t: "log", e: { agent: "SYSTEM", msg: "Health check failed", level: "err" } }));
  }, []);

  // Persist the learner's map (debounced). Skips until hydrated so seed data never overwrites a save.
  useEffect(() => {
    if (!state.ready) return;
    const t = setTimeout(() => save(state), 300);
    return () => clearTimeout(t);
  }, [state]);

  const nodes = useMemo(() => replay(state.events), [state.events]);
  const say = useCallback<Ctx["say"]>((agent, msg, level = "info", demo) => dispatch({ t: "log", e: { agent, msg, level, demo } }), []);
  const track = useCallback<Ctx["track"]>((slug, kind, payload) => dispatch({ t: "event", slug, kind, payload }), []);

  const value = useMemo(() => ({ ...state, nodes, dispatch, say, track }), [state, nodes, say, track]);
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
    const sessionKeys = new Set(events.filter((e) => e.kind === "session").map((e) => `${String(e.payload?.with ?? "")}|${Math.round(e.at / 60_000)}`));
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
  const { concepts, edges, nodes } = useStore();
  const suggestions = useSuggestions();
  return useMemo(() => pathFor(concepts, edges, nodes, suggestions), [concepts, edges, nodes, suggestions]);
}
