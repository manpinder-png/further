"use client";
// Left pane: "Your journey" (DESIGN D38). Progress, your path, quests, activity,
// connections and sessions. Collapses to a narrow icon strip on tablet and desktop;
// on phones it opens as a drawer from the header.
import { useEffect, useMemo, useState } from "react";
import { useMapStats, usePath, useStore } from "@/lib/client/store";
import { CloseIcon, Head, LevelRing, NodeIcon, useNow } from "@/components/ui/bits";
import { CATALOG } from "@/lib/demo/seed";
import { personName, plural, relTime } from "@/lib/client/format";
import { replay } from "@/lib/math";
import { BUILDER_VIEW } from "@/lib/builder";
import AgentLog from "@/components/builder/AgentLog";

type SectionId = "progress" | "path" | "quests" | "activity" | "people" | "sessions";
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "progress", label: "Progress" },
  { id: "path", label: "Your path" },
  { id: "quests", label: "Quests" },
  { id: "activity", label: "Activity" },
  { id: "people", label: "Connections" },
  { id: "sessions", label: "Sessions" },
];
const OPEN_KEY = "further:pane:open";
const DEFAULT_OPEN: SectionId[] = ["progress", "path", "quests", "activity"];
const MAX_ACTIVITY = 5;

export default function LeftRail({ collapsed = false, onCollapse, drawer = false }: { collapsed?: boolean; onCollapse?: (v: boolean) => void; drawer?: boolean }) {
  const { dispatch } = useStore();
  const stats = useMapStats();
  const path = usePath();
  const [open, setOpen] = useState<Set<SectionId>>(new Set(DEFAULT_OPEN));
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "null");
      if (Array.isArray(saved)) setOpen(new Set(saved));
    } catch { /* keep defaults */ }
  }, []);
  const toggle = (id: SectionId, force?: boolean) =>
    setOpen((o) => {
      const n = new Set(o);
      if (force ?? !n.has(id)) n.add(id);
      else n.delete(id);
      try { localStorage.setItem(OPEN_KEY, JSON.stringify([...n])); } catch { /* ignore */ }
      return n;
    });

  if (collapsed)
    return (
      <nav className="flex h-full flex-col items-center gap-1 py-2" aria-label="Your journey">
        <button className="btn btn-ghost btn-icon border-transparent text-muted hover:text-text" onClick={() => onCollapse?.(false)} aria-label="Expand your journey" title="Expand">
          <Chevron dir="right" />
        </button>
        <button className="mt-1 rounded-full" onClick={() => { onCollapse?.(false); toggle("progress", true); }} aria-label={`Level ${stats.level}. Open progress`} title={`Level ${stats.level} · ${stats.next - stats.xp} XP to level ${stats.level + 1}`}>
          <LevelRing level={stats.level} frac={stats.frac} size={40} />
        </button>
        <div className="my-1 h-px w-8 bg-line" />
        {SECTIONS.slice(1).map((s) => (
          <button
            key={s.id}
            className="btn btn-ghost btn-icon relative border-transparent text-muted hover:text-text"
            onClick={() => {
              onCollapse?.(false);
              toggle(s.id, true);
              setTimeout(() => document.getElementById(`pane-${s.id}`)?.scrollIntoView({ block: "start" }), 60);
            }}
            aria-label={`Open ${s.label}`}
            title={s.label}
          >
            <SectionIcon id={s.id} />
            {s.id === "path" && path.length > 0 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-mastery" aria-hidden />}
          </button>
        ))}
      </nav>
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line pl-4 pr-1">
        <h2 className="text-sm font-semibold">Your journey</h2>
        {drawer ? (
          <button className="btn btn-ghost btn-icon border-transparent text-muted hover:text-text" onClick={() => dispatch({ t: "rail", open: false })} aria-label="Close your journey" title="Close">
            <CloseIcon />
          </button>
        ) : (
          <button className="btn btn-ghost btn-icon border-transparent text-muted hover:text-text" onClick={() => onCollapse?.(true)} aria-label="Collapse your journey" title="Collapse">
            <Chevron dir="left" />
          </button>
        )}
      </header>
      <div className="scroll min-h-0 flex-1">
        {SECTIONS.map((s) => (
          <Section key={s.id} id={s.id} label={s.label} open={open.has(s.id)} onToggle={() => toggle(s.id)} right={sectionCount(s.id, stats, path.length)}>
            {s.id === "progress" && <Progress />}
            {s.id === "path" && <Path />}
            {s.id === "quests" && <Quests />}
            {s.id === "activity" && <Activity />}
            {s.id === "people" && <People />}
            {s.id === "sessions" && <Sessions />}
          </Section>
        ))}
        {BUILDER_VIEW && <div className="h-72"><AgentLog /></div>}
      </div>
    </div>
  );
}

function sectionCount(id: SectionId, stats: ReturnType<typeof useMapStats>, pathLen: number) {
  if (id === "progress") return `Level ${stats.level}`;
  if (id === "path") return pathLen ? plural(pathLen, "step") : null;
  if (id === "quests") return stats.quests ? plural(stats.quests, "quest") : null;
  if (id === "sessions") return stats.sessions ? String(stats.sessions) : null;
  return null;
}

function Section({ id, label, open, onToggle, right, children }: { id: SectionId; label: string; open: boolean; onToggle: () => void; right?: string | null; children: React.ReactNode }) {
  return (
    <section id={`pane-${id}`} className="border-b border-line">
      <h3>
        <button className="flex min-h-10 w-full items-center gap-2 px-4 text-left hover:bg-panel-2" onClick={onToggle} aria-expanded={open} aria-controls={`pane-${id}-body`}>
          <span className={`text-dim transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>▸</span>
          <span className="label flex-1">{label}</span>
          {right && <span className="text-xs text-dim">{right}</span>}
        </button>
      </h3>
      {open && <div id={`pane-${id}-body`} className="px-4 pb-4 pt-1">{children}</div>}
    </section>
  );
}

/* ---------- Progress ---------- */

function Progress() {
  const stats = useMapStats();
  const { events, nodes } = useStore();
  const week = useMemo(() => {
    const then = replay(events, Date.now() - 7 * 86_400_000);
    const was = Object.values(then).filter((n) => n.state === "understood").length;
    return { understood: stats.understood - was, topics: Object.keys(nodes).length - Object.keys(then).length };
  }, [events, nodes, stats.understood]);
  return (
    <div>
      <div className="flex items-center gap-3">
        <LevelRing level={stats.level} frac={stats.frac} size={48} />
        <div className="min-w-0 flex-1">
          <p className="display text-lg leading-tight">Level {stats.level}</p>
          <p className="text-xs text-muted">{stats.next - stats.xp} XP to level {stats.level + 1}</p>
          <div className="kbar mt-1.5" role="meter" aria-label={`Level progress ${Math.round(stats.frac * 100)}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(stats.frac * 100)}>
            <i style={{ width: `${Math.max(3, stats.frac * 100)}%` }} />
          </div>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
        {([["understood", "Understood", stats.understood], ["explored", "Explored", stats.explored], ["seeded", "On your map", stats.onMap]] as const).map(([st, label, v]) => (
          <div key={st} className="flex flex-col items-center gap-0.5 bg-panel py-2">
            <NodeIcon state={st} mastery={0.4} size={14} />
            <dd className="text-lg font-semibold tabular-nums">{v}</dd>
            <dt className="text-2xs text-muted">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">
        This week: <span className="text-text">{plural(Math.max(0, week.understood), "topic")} understood</span>, {plural(Math.max(0, week.topics), "new topic")}
      </p>
    </div>
  );
}

/* ---------- Your path ---------- */

function Path() {
  const path = usePath();
  const { dispatch, selected } = useStore();
  if (!path.length) return <p className="text-sm text-muted">Ask about something you&apos;re curious about and your path will appear here.</p>;
  return (
    <ol className="relative" aria-label="Suggested order">
      <span className="absolute bottom-4 left-[11px] top-4 w-px bg-line-2" aria-hidden />
      {path.map((s, i) => (
        <li key={s.slug} className="relative">
          <button
            className={`flex w-full items-start gap-3 rounded-md py-2 pr-2 text-left hover:bg-panel-2 ${selected === s.slug ? "bg-panel-2" : ""}`}
            onClick={() => dispatch({ t: "select", slug: s.slug })}
          >
            <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold tabular-nums ${i === 0 ? "border-mastery bg-mastery-soft text-mastery" : "border-line-2 bg-panel text-muted"}`}>{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm">{s.title}</span>
                {i === 0 && <span className="shrink-0 text-2xs font-medium text-mastery">Next up</span>}
              </span>
              <span className="block text-xs text-muted">{s.reason}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Quests ---------- */

function Quests() {
  const { missions, nodes } = useStore();
  if (!missions.length) return <p className="text-sm text-muted">No quests yet. Ask about anything you&apos;re curious about. Vague is fine.</p>;
  return (
    <ul className="space-y-1.5">
      {missions.slice(0, 6).map((m) => {
        const slugs = m.slugs ?? [];
        const done = slugs.filter((s) => nodes[s] && nodes[s].state !== "seeded").length;
        const understood = slugs.filter((s) => nodes[s]?.state === "understood").length;
        const complete = slugs.length > 0 && understood === slugs.length;
        return (
          <li key={m.id} className="rounded-md border border-line bg-panel-2 px-3 py-2">
            <p className="truncate text-sm" title={m.text}>{m.text}</p>
            {m.status === "running" ? (
              <p className="mt-0.5 text-xs text-muted">Adding topics…</p>
            ) : m.status === "error" ? (
              <p className="mt-0.5 text-xs text-err">Couldn&apos;t add topics. Try again.</p>
            ) : slugs.length ? (
              <>
                <p className={`mt-0.5 text-xs ${complete ? "text-success" : "text-muted"}`}>{complete ? "✓ Quest complete" : `${done} of ${plural(slugs.length, "topic")} explored`}</p>
                <span className="kbar mt-1.5" aria-hidden><i style={{ width: `${(done / slugs.length) * 100}%` }} /></span>
              </>
            ) : (
              <p className="mt-0.5 text-xs text-muted">Added {plural(m.added, "topic")}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Activity ---------- */

type Item = { key: string; at: number; node: React.ReactNode };

function Activity() {
  const items = useActivity();
  const now = useNow();
  return (
    <ol className="space-y-2" aria-label="Recent activity">
      {items.length === 0 && <li className="text-sm text-muted">Nothing yet.</li>}
      {items.slice(0, MAX_ACTIVITY).map((a) => (
        <li key={a.key} className="flex items-baseline gap-3 text-sm">
          <span className="min-w-0 flex-1 text-text/90">{a.node}</span>
          <span className="shrink-0 text-xs tabular-nums text-dim">{relTime(a.at, now)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Plain-language activity from the event log plus notes (matches). Quick runs of "added" collapse into one line. */
function useActivity(): Item[] {
  const { events, concepts, notes } = useStore();
  return useMemo(() => {
    const title = (s: string) => concepts[s]?.title ?? CATALOG[s]?.title ?? s;
    const em = (s: string) => <em className="not-italic text-text">{title(s)}</em>;
    const out: Item[] = [];
    let run: { slugs: string[]; at: number; id: number } | null = null;
    const flush = () => {
      if (!run) return;
      const [first, ...rest] = run.slugs;
      out.push({ key: `seed-${run.id}`, at: run.at, node: <>Added {em(first)}{rest.length ? ` and ${plural(rest.length, "more topic")}` : ""} to your map</> });
      run = null;
    };
    for (const e of events) {
      if (e.kind === "seed") {
        if (run && e.at - run.at < 20_000) { run.slugs.push(e.slug); run.at = e.at; continue; }
        flush();
        run = { slugs: [e.slug], at: e.at, id: e.id };
        continue;
      }
      if (e.kind === "explain") out.push({ key: `e${e.id}`, at: e.at, node: <>Explained {em(e.slug)} in your own words</> });
      else if (e.kind === "watch") out.push({ key: `e${e.id}`, at: e.at, node: <>Watched a source on {em(e.slug)}</> });
      else if (e.kind === "session") out.push({ key: `e${e.id}`, at: e.at, node: <>Learned {em(e.slug)} with {personName(String(e.payload?.with ?? "a peer"))}</> });
    }
    flush();
    notes.forEach((n, i) => out.push({ key: `n${i}-${n.at}`, at: n.at, node: n.text }));
    return out.sort((a, b) => b.at - a.at);
  }, [events, concepts, notes]);
}

/* ---------- Connections ---------- */

function People() {
  const { explorers, nodes } = useStore();
  const sessions = useSessions();
  const now = useNow();
  const learned = useMemo(() => {
    const m = new Map<string, { name: string; topics: Set<string>; at: number }>();
    for (const s of sessions) {
      const p = m.get(s.peer) ?? { name: s.peer, topics: new Set<string>(), at: 0 };
      s.topics.forEach((t) => p.topics.add(t));
      p.at = Math.max(p.at, s.at);
      m.set(s.peer, p);
    }
    return [...m.values()].sort((a, b) => b.at - a.at);
  }, [sessions]);
  const color = (name: string) => explorers.find((e) => e.name === name)?.color ?? "#85858d";
  return (
    <div className="space-y-3">
      <div>
        <h4 className="mb-1 text-xs text-muted">Learned with</h4>
        {learned.length === 0 ? (
          <p className="text-sm text-muted">No one yet.</p>
        ) : (
          <ul className="space-y-1">
            {learned.map((p) => (
              <li key={p.name} className="flex items-center gap-2.5 py-1">
                <Head color={color(p.name)} name={p.name} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{p.name}</span>
                  <span className="block truncate text-xs text-muted">{[...p.topics].join(", ")}</span>
                </span>
                <span className="shrink-0 text-xs text-dim">{relTime(p.at, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="mb-1 text-xs text-muted">Learning now</h4>
        <ul>
          {explorers.map((e) => {
            const at = e.activeConcepts[0];
            return (
              <li key={e.id} className="flex items-center gap-2.5 py-1">
                <Head color={e.color} name={e.name} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{e.name}</span>
                  <span className="block truncate text-xs text-muted">{nodes[at] ? "on a topic near yours" : `on ${CATALOG[at]?.title ?? at}`}</span>
                </span>
                {e.openToMatch && <span className="dot bg-success" role="img" aria-label="Open to learn together" title="Open to learn together" />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ---------- Sessions ---------- */

/** Sessions grouped from "session" events (same grouping as useMapStats). */
function useSessions() {
  const { events, concepts } = useStore();
  return useMemo(() => {
    const m = new Map<string, { peer: string; topics: string[]; at: number }>();
    for (const e of events) {
      if (e.kind !== "session") continue;
      const peer = personName(String(e.payload?.with ?? "a peer"));
      const key = `${String(e.payload?.with ?? "")}|${Math.round(e.at / 60_000)}`;
      const s = m.get(key) ?? { peer, topics: [], at: e.at };
      s.topics.push(concepts[e.slug]?.title ?? CATALOG[e.slug]?.title ?? e.slug);
      s.at = Math.max(s.at, e.at);
      m.set(key, s);
    }
    return [...m.values()].sort((a, b) => b.at - a.at);
  }, [events, concepts]);
}

function Sessions() {
  const sessions = useSessions();
  const now = useNow();
  if (!sessions.length) return <p className="text-sm text-muted">No sessions yet. Accept a match on the map to learn with someone for 10 minutes.</p>;
  return (
    <ul className="space-y-1.5">
      {sessions.map((s, i) => (
        <li key={i} className="rounded-md border border-line bg-panel-2 px-3 py-2">
          <p className="flex items-baseline justify-between gap-2 text-sm">
            <span>with {s.peer}</span>
            <span className="text-xs text-dim">{relTime(s.at, now)}</span>
          </p>
          <p className="truncate text-xs text-muted">{s.topics.join(" · ")}</p>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Icons ---------- */

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d={dir === "left" ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function SectionIcon({ id }: { id: SectionId }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      {id === "path" && <><circle cx="4" cy="4" r="2" {...common} /><circle cx="14" cy="14" r="2" {...common} /><path d="M6 4h4a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h4" {...common} /></>}
      {id === "quests" && <><path d="M4 2.5v13" {...common} /><path d="M4 3h9l-2 3 2 3H4" {...common} /></>}
      {id === "activity" && <path d="M2 9h3l2-5 4 10 2-5h3" {...common} />}
      {id === "people" && <><circle cx="6.5" cy="6" r="2.5" {...common} /><circle cx="12.5" cy="7" r="2" {...common} /><path d="M2 15c.5-2.5 2.3-4 4.5-4s4 1.5 4.5 4M11 11.2c2.2-.3 4 1 4.5 3.3" {...common} /></>}
      {id === "sessions" && <><path d="M3 4h12v8H8l-3 2.5V12H3z" {...common} /></>}
    </svg>
  );
}
