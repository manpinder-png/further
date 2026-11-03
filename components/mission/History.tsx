"use client";
// Learning history: progress buckets, recent activity, past sessions and connections.
// These live on the Profile page so the map screen stays focused on one question.
import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/client/store";
import { Head, NodeIcon, useNow } from "@/components/ui/bits";
import { CATALOG } from "@/lib/demo/seed";
import { personName, plural, relTime } from "@/lib/client/format";

const MAX_ACTIVITY = 8;

/* ---------- Progress ---------- */

export function ProgressSummary() {
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

/* ---------- Activity ---------- */

type Item = { key: string; at: number; node: React.ReactNode };

export function Activity() {
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

/* ---------- Sessions ---------- */

/** Saved room IDs come from the authorized snapshot; legacy activity adds no guessed room links. */
export function useSessions() {
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

export function Sessions() {
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

/* ---------- Connections ---------- */

export function Connections() {
  const { explorers, concepts, nodes } = useStore();
  const sessions = useSessions();
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
  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-1 text-xs text-muted">Conversations with</h4>
        {learned.length === 0 ? <p className="text-sm text-muted">No one yet.</p> : (
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
        <h4 className="mb-1 text-xs text-muted">Learning now</h4>
        {!explorers.length && <p className="text-sm text-muted">No other learners are available right now.</p>}
        <ul>
          {explorers.map((e) => {
            const at = e.activeConcepts[0];
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
