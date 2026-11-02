"use client";
// Left pane: "Your journey" (DESIGN D38). Progress, your path, quests, activity,
// connections and sessions. Collapses to a narrow icon strip on tablet and desktop;
// on phones it opens as a drawer from the header.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePath, useStore } from "@/lib/client/store";
import { CloseIcon, Head, NodeIcon, useNow } from "@/components/ui/bits";
import { CATALOG } from "@/lib/demo/seed";
import { personName, plural, relTime } from "@/lib/client/format";
import { explanationFor, learningPaths, orderPath } from "@/lib/client/learning-paths";
import { useMatchJob } from "@/lib/client/hooks";
import { BUILDER_VIEW } from "@/lib/builder";
import AgentLog from "@/components/builder/AgentLog";
import { OperationStatus } from "@/components/activity/ActivityPanel";

type SectionId = "progress" | "path" | "quests" | "activity" | "people" | "sessions";
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "progress", label: "Progress" },
  { id: "path", label: "Your path" },
  { id: "quests", label: "Questions" },
  { id: "activity", label: "Activity" },
  { id: "people", label: "Connections" },
  { id: "sessions", label: "Sessions" },
];
const OPEN_KEY = "further:pane:open:v2";
const DEFAULT_OPEN: SectionId[] = ["path", "quests"];
const MAX_ACTIVITY = 5;

interface LeftRailProps {
  collapsed?: boolean;
  onCollapse?: (v: boolean) => void;
  drawer?: boolean;
  activeQuestionKey?: string;
  onChooseQuestion?: (key: string) => void;
  onSelectTopic?: (slug: string) => void;
  activeSlugs?: string[];
}

export default function LeftRail({ collapsed = false, onCollapse, drawer = false, activeQuestionKey, onChooseQuestion, onSelectTopic, activeSlugs }: LeftRailProps) {
  const { dispatch, missions, concepts, nodes } = useStore();
  const conceptCount = Object.keys(nodes).filter(slug => concepts[slug]).length;
  const path = useRailPath(activeSlugs);
  const questionCount = learningPaths(missions, concepts).length;
  const [open, setOpen] = useState<Set<SectionId>>(new Set(DEFAULT_OPEN));
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "null");
      if (Array.isArray(saved)) setOpen(new Set(saved.filter((id): id is SectionId => SECTIONS.some(section => section.id === id))));
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
        <button className="mt-1 flex h-10 w-10 items-center justify-center rounded-full border border-line-2 text-mastery" onClick={() => { onCollapse?.(false); toggle("progress", true); }} aria-label="Open learning activity" title={`${plural(conceptCount, "concept")} on your map`}>
          <NodeIcon state="explored" size={20} />
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
          <Section key={s.id} id={s.id} label={s.label} open={open.has(s.id)} onToggle={() => toggle(s.id)} right={sectionCount(s.id, path.length, questionCount)}>
            {s.id === "progress" && <Progress />}
            {s.id === "path" && <Path activeSlugs={activeSlugs} onSelectTopic={onSelectTopic} />}
            {s.id === "quests" && <Questions activeQuestionKey={activeQuestionKey} onChooseQuestion={onChooseQuestion} />}
            {s.id === "activity" && <Activity />}
            {s.id === "people" && <People activeSlugs={activeSlugs} />}
            {s.id === "sessions" && <Sessions />}
          </Section>
        ))}
        {BUILDER_VIEW && <div className="h-72"><AgentLog /></div>}
      </div>
    </div>
  );
}

function sectionCount(id: SectionId, pathLen: number, questionCount: number) {
  if (id === "path") return pathLen ? plural(pathLen, "step") : null;
  if (id === "quests") return questionCount ? String(questionCount) : null;
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
  const { events, concepts, nodes } = useStore();
  const owned = Object.values(nodes).filter(node => concepts[node.slug]);
  const ownedSlugs = new Set(owned.map(node => node.slug));
  const reviews = events.filter(event => ownedSlugs.has(event.slug) && event.kind === "explain" && typeof event.payload?.score === "number" && Number.isFinite(event.payload.score));
  const reviewedSlugs = new Set(reviews.map(event => event.slug));
  const unreviewed = owned.filter(node => !reviewedSlugs.has(node.slug));
  const notStarted = unreviewed.filter(node => node.state === "seeded").length;
  // A reviewed concept belongs to that category even if its graph state remains
  // exploring. These display buckets partition ownership without changing evidence.
  const exploring = unreviewed.length - notStarted;
  const week = reviews.filter(event => event.at >= Date.now() - 7 * 86_400_000).length;
  return (
    <div>
      <p className="text-sm">{plural(owned.length, "concept")} on your map</p>
      <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
        {([["understood", "Reviewed", reviewedSlugs.size], ["explored", "Exploring", exploring], ["seeded", "Not started", notStarted]] as const).map(([st, label, v]) => (
          <div key={st} className="flex flex-col items-center gap-0.5 bg-panel py-2">
            <NodeIcon state={st} mastery={0.4} size={14} />
            <dd className="text-lg font-semibold tabular-nums">{v}</dd>
            <dt className="text-2xs text-muted">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">{plural(week, "explanation")} reviewed this week.</p>
      <p className="mt-1 text-xs text-muted">AI feedback is a prompt for practice, not a measure of mastery.</p>
    </div>
  );
}

/* ---------- Your path ---------- */

function useRailPath(activeSlugs?: string[]) {
  const suggested = usePath();
  const { concepts, edges, nodes, events } = useStore();
  return useMemo(() => activeSlugs === undefined ? suggested.filter(step => concepts[step.slug] && nodes[step.slug]) : orderPath(activeSlugs.filter(slug => concepts[slug]), edges).map(slug => ({
    slug, title: concepts[slug].title,
    reason: explanationFor(slug, events) ? "Explanation reviewed · try another example" : nodes[slug]?.state === "seeded" ? "Start with a concrete example" : "Continue exploring",
  })), [activeSlugs, suggested, concepts, edges, nodes, events]);
}

function Path({ activeSlugs, onSelectTopic }: Pick<LeftRailProps, "activeSlugs" | "onSelectTopic">) {
  const path = useRailPath(activeSlugs);
  const { dispatch, selected, concepts } = useStore();
  if (!path.length) return <p className="text-sm text-muted">{Object.keys(concepts).length ? "Choose a saved question to see its path, or open a topic on your knowledge map." : "Ask about something you’re curious about and your path will appear here."}</p>;
  return (
    <ol className="relative" aria-label="Suggested order">
      <span className="absolute bottom-4 left-[11px] top-4 w-px bg-line-2" aria-hidden />
      {path.map((s, i) => (
        <li key={s.slug} className="relative">
          <button
            className={`flex w-full items-start gap-3 rounded-md py-2 pr-2 text-left hover:bg-panel-2 ${selected === s.slug ? "bg-panel-2" : ""}`}
            aria-current={selected === s.slug ? "step" : undefined}
            onClick={() => { if (onSelectTopic) onSelectTopic(s.slug); else dispatch({ t: "select", slug: s.slug }); dispatch({ t: "rail", open: false }); }}
          >
            <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold tabular-nums ${i === 0 ? "border-mastery bg-mastery-soft text-mastery" : "border-line-2 bg-panel text-muted"}`}>{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm">{s.title}</span>
                {i === 0 && <span className="shrink-0 text-2xs font-medium text-mastery">{activeSlugs === undefined ? "Next up" : "Suggested"}</span>}
              </span>
              <span className="block text-xs text-muted">{s.reason}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Questions ---------- */

function Questions({ activeQuestionKey, onChooseQuestion }: Pick<LeftRailProps, "activeQuestionKey" | "onChooseQuestion">) {
  const { missions, concepts, nodes, events } = useStore();
  const paths = learningPaths(missions, concepts);
  const pending = missions.filter(mission => mission.status !== "done");
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? paths : paths.filter((path, index) => index < 6 || path.key === activeQuestionKey);
  if (!paths.length && !pending.length) return <p className="text-sm text-muted">Ask about anything you&apos;re curious about. Your questions stay saved here.</p>;
  return (
    <ul className="space-y-1.5">
      {pending.slice(0, 3).map(mission => <li key={mission.id} className="rounded-md border border-line bg-panel-2 px-3 py-2"><p className="truncate text-sm" title={mission.text}>{mission.text}</p><p className={`mt-0.5 text-xs ${mission.status === "error" ? "text-err" : "text-muted"}`}>{mission.status === "error" ? "Couldn't add concepts. Retry in the question box." : "Adding concepts…"}</p></li>)}
      {visible.map(path => {
        const saved = path.slugs.filter(slug => nodes[slug]);
        const reviewed = saved.filter(slug => explanationFor(slug, events)).length;
        const content = <><span className="block truncate text-sm" title={path.question}>{path.question}</span><span className="mt-0.5 block text-xs text-muted">{plural(saved.length, "concept")}{reviewed ? ` · ${reviewed} reviewed` : ""}</span></>;
        return (
          <li key={path.key} className={`overflow-hidden rounded-md border bg-panel-2 ${activeQuestionKey === path.key ? "border-mastery/50" : "border-line"}`}>
            {onChooseQuestion ? <button className="w-full px-3 py-2 text-left hover:bg-panel" onClick={() => onChooseQuestion(path.key)} aria-current={activeQuestionKey === path.key ? "true" : undefined}>{content}</button> : <div className="px-3 py-2">{content}</div>}
          </li>
        );
      })}
      {paths.length > 6 && <li><button className="mt-1 text-xs text-muted hover:text-text" onClick={() => setShowAll(value => !value)}>{showAll ? "Show fewer questions" : `Show all ${paths.length} questions`}</button></li>}
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
  const { events, concepts, notes, peerNames } = useStore();
  return useMemo(() => {
    const title = (s: string) => concepts[s]?.title ?? CATALOG[s]?.title ?? s;
    const em = (s: string) => <em className="not-italic text-text">{title(s)}</em>;
    const out: Item[] = [];
    let run: { slugs: string[]; at: number; id: number } | null = null;
    const flush = () => {
      if (!run) return;
      const [first, ...rest] = run.slugs;
      out.push({ key: `seed-${run.id}`, at: run.at, node: <>Added {em(first)}{rest.length ? ` and ${plural(rest.length, "more concept")}` : ""} to your map</> });
      run = null;
    };
    for (const e of events) {
      if (e.kind === "seed") {
        if (run && e.at - run.at < 20_000) { run.slugs.push(e.slug); run.at = e.at; continue; }
        flush();
        run = { slugs: [e.slug], at: e.at, id: e.id };
        continue;
      }
      if (e.kind === "explain") out.push({ key: `e${e.id}`, at: e.at, node: <>Explanation reviewed for {em(e.slug)}</> });
      else if (e.kind === "watch") out.push({ key: `e${e.id}`, at: e.at, node: <>{e.payload?.source ? "Read a source on" : "Practiced"} {em(e.slug)}</> });
      else if (e.kind === "session") out.push({ key: `e${e.id}`, at: e.at, node: <>Discussed {em(e.slug)} with {personName(String(e.payload?.with ?? "a peer"), peerNames)}</> });
    }
    flush();
    notes.forEach((n, i) => out.push({ key: `n${i}-${n.at}`, at: n.at, node: n.text }));
    return out.sort((a, b) => b.at - a.at);
  }, [events, concepts, notes, peerNames]);
}

/* ---------- Connections ---------- */

function People({ activeSlugs }: { activeSlugs?: string[] }) {
  const { explorers, nodes, concepts, dispatch } = useStore();
  const sessions = useSessions();
  const available = activeSlugs === undefined ? explorers : explorers.filter(peer => peer.activeConcepts.some(slug => activeSlugs.includes(slug)));
  const now = useNow();
  const learned = useMemo(() => {
    const m = new Map<string, { id: string; name: string; topics: Set<string>; at: number }>();
    for (const s of sessions) {
      const p = m.get(s.peerId) ?? { id: s.peerId, name: s.peer, topics: new Set<string>(), at: 0 };
      s.topics.forEach((t) => p.topics.add(t));
      p.at = Math.max(p.at, s.at);
      m.set(s.peerId, p);
    }
    return [...m.values()].sort((a, b) => b.at - a.at);
  }, [sessions]);
  const color = (id: string) => explorers.find((e) => e.id === id)?.color ?? "#85858d";
  const runMatch = useMatchJob();
  const [looking, setLooking] = useState<"idle" | "looking" | "none">("idle");
  const [error, setError] = useState<string | null>(null);
  const find = async () => {
    setLooking("looking"); setError(null);
    try {
      const m = await runMatch({ quietIfNone: true, ...(activeSlugs === undefined ? {} : { conceptSlugs: activeSlugs }) });
      if (m) dispatch({ t: "rail", open: false });
      setLooking(m ? "idle" : "none");
    } catch { setError("Couldn't search for a peer. Please try again."); setLooking("idle"); }
  };
  return (
    <div className="space-y-3">
      <div>
        <h4 className="mb-1 text-xs text-muted">Conversations with</h4>
        {learned.length === 0 ? (
          <p className="text-sm text-muted">No one yet.</p>
        ) : (
          <ul className="space-y-1">
            {learned.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 py-1">
                <Head color={color(p.id)} name={p.name} size={22} />
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
        <button className="btn mb-2 w-full" onClick={find} disabled={looking === "looking" || activeSlugs?.length === 0}>{looking === "looking" ? "Looking…" : "Find someone to learn with"}</button>
        {looking === "looking" && <OperationStatus label="Checking available learners" detail="Looking for shared topics, a common language and enough time to learn together." />}
        {looking === "none" && <p className="mb-2 text-xs text-muted">No suitable peer is available for this question right now. Keep exploring and try again later.</p>}
        {error && <p className="mb-2 text-xs text-err" role="alert">{error}</p>}
        <h4 className="mb-1 text-xs text-muted">Learning now</h4>
        {!available.length && <p className="text-sm text-muted">No other learners are available around these topics right now.</p>}
        <ul>
          {available.map((e) => {
            const at = (activeSlugs ? e.activeConcepts.find(slug => activeSlugs.includes(slug)) : undefined) ?? e.activeConcepts[0];
            return (
              <li key={e.id} className="flex items-center gap-2.5 py-1">
                <Head color={e.color} name={e.name} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{e.name}{e.demo ? " · sample" : ""}</span>
                  <span className="block truncate text-xs text-muted">{at ? `Exploring ${concepts[at]?.title ?? CATALOG[at]?.title ?? (nodes[at] ? "a shared topic" : at.replaceAll("-", " "))}` : "Available to learn together"}</span>
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

/** Saved room IDs come from the authorized snapshot; legacy activity adds no guessed room links. */
function useSessions() {
  const { events, concepts, sessions, peerNames, dataMode } = useStore();
  return useMemo(() => {
    const m = new Map<string, { key: string; id?: string; peerId: string; peer: string; topics: string[]; at: number }>();
    const title = (slug: string) => concepts[slug]?.title ?? CATALOG[slug]?.title ?? slug.replaceAll("-", " ");
    for (const saved of sessions) {
      const key = saved.id ?? `${saved.peer}|${Math.round(saved.at / 60_000)}`;
      m.set(key, { key, id: dataMode === "local" ? saved.id : undefined, peerId: saved.peer, peer: personName(saved.peer, peerNames), topics: saved.concepts.map(title), at: saved.at });
    }
    for (const e of events) {
      if (e.kind !== "session") continue;
      const peerId = String(e.payload?.with ?? "a peer");
      const key = String(e.payload?.sessionId ?? `${peerId}|${Math.round(e.at / 60_000)}`);
      const s = m.get(key) ?? { key, peerId, peer: personName(peerId, peerNames), topics: [], at: e.at };
      if (!s.topics.includes(title(e.slug))) s.topics.push(title(e.slug));
      s.at = Math.max(s.at, e.at);
      m.set(key, s);
    }
    return [...m.values()].sort((a, b) => b.at - a.at);
  }, [events, concepts, sessions, peerNames, dataMode]);
}

function Sessions() {
  const sessions = useSessions();
  const now = useNow();
  if (!sessions.length) return <p className="text-sm text-muted">No sessions yet. A shared conversation starts when both people accept a match.</p>;
  return (
    <ul className="space-y-1.5">
      {sessions.map(s => (
        <li key={s.key} className="rounded-md border border-line bg-panel-2 px-3 py-2">
          <p className="flex items-baseline justify-between gap-2 text-sm">
            <span>with {s.peer}</span>
            <span className="text-xs text-dim">{relTime(s.at, now)}</span>
          </p>
          <p className="truncate text-xs text-muted">{s.topics.join(" · ")}</p>
          {s.id && <Link href={`/session?s=${encodeURIComponent(s.id)}`} className="mt-1.5 inline-block text-xs text-mastery hover:underline">View conversation →</Link>}
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
