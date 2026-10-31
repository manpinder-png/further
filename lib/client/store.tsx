"use client";
// Client state. The event log is the source of truth: node interest/mastery/state
// are replayed from it with lib/math.ts (plan §5.4), exactly like the time-lapse.
// Production (Connor/Amit): hydrate from Supabase (`events`, `concepts`, `concept_edges`)
// and append events through an API route; Realtime keeps other devices in sync.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { AgentName, Concept, Edge, EventKind, Explorer, FEvent, LogEntry, MatchRequest, Profile, UserNode } from "../types";
import { replay } from "../math";
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
  fitKey: number;
}

type Action =
  | { t: "hydrate"; now: number }
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
  | { t: "fit" };

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
  fitKey: 0,
};

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "hydrate": {
      const concepts: Record<string, Concept> = {};
      for (const slug of START_SLUGS) concepts[slug] = { ...CATALOG[slug] };
      return {
        ...s,
        ready: true,
        concepts,
        edges: CATALOG_EDGES,
        events: seedEvents(a.now),
        explorers: seedExplorers(a.now),
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
    dispatch({ t: "hydrate", now: Date.now() });
    fetch("/api/health")
      .then((r) => r.json())
      .then((s: SystemStatus) => {
        dispatch({ t: "status", s });
        const demo = Object.entries(s).filter(([, v]) => v === "demo").map(([k]) => k);
        if (demo.length) dispatch({ t: "log", e: { agent: "SYSTEM", msg: `Demo mode for: ${demo.join(", ")}`, level: "warn" } });
      })
      .catch(() => dispatch({ t: "log", e: { agent: "SYSTEM", msg: "Health check failed", level: "err" } }));
  }, []);

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
