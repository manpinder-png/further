"use client";
// Left rail: your quests, recent activity in plain language, and who's learning now.
import { useMemo } from "react";
import { useMapStats, useStore } from "@/lib/client/store";
import { Head, Panel, useNow } from "@/components/ui/bits";
import { CATALOG } from "@/lib/demo/seed";
import { personName, plural, relTime } from "@/lib/client/format";
import { BUILDER_VIEW } from "@/lib/builder";
import AgentLog from "@/components/builder/AgentLog";

const MAX_ACTIVITY = 5;

export default function LeftRail() {
  const { missions, explorers, nodes } = useStore();
  const stats = useMapStats();
  const activity = useActivity();
  const now = useNow();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Panel title="Your quests" right={<span className="text-xs text-dim">{plural(stats.quests, "quest")}</span>} className="max-h-[34%]">
        <ul className="scroll h-full space-y-1.5 px-3 pb-3">
          {missions.length === 0 && (
            <li className="py-1 text-sm leading-relaxed text-muted">
              No quests yet. Ask about anything you&apos;re curious about. Vague is fine.
            </li>
          )}
          {missions.map((m) => (
            <li key={m.id} className="enter border border-line bg-panel-2 px-3 py-2">
              <p className="truncate text-sm" title={m.text}>{m.text}</p>
              <p className={`mt-0.5 text-xs ${m.status === "error" ? "text-err" : "text-dim"}`}>
                {m.status === "running" ? "Adding concepts…" : m.status === "error" ? "Couldn't add concepts. Try again." : `Added ${plural(m.added, "concept")}`}
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Activity" className={BUILDER_VIEW ? "" : "flex-1"}>
        <ol className="space-y-2 px-4 pb-3" aria-label="Recent activity">
          {activity.length === 0 && <li className="text-sm text-muted">Nothing yet.</li>}
          {activity.slice(0, MAX_ACTIVITY).map((a) => (
            <li key={a.key} className="flex items-baseline gap-3 text-sm">
              <span className="min-w-0 flex-1 text-text/90">{a.node}</span>
              <span className="shrink-0 text-xs tabular-nums text-dim">{relTime(a.at, now)}</span>
            </li>
          ))}
        </ol>
      </Panel>

      {BUILDER_VIEW && <AgentLog />}

      <Panel title="Learning now" className="max-h-[34%]">
        <ul className="scroll h-full px-2 pb-2">
          {explorers.map((e) => {
            const at = e.activeConcepts[0];
            return (
              <li key={e.id} className="flex items-center gap-3 px-2 py-1.5">
                <Head color={e.color} size={20} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{e.name}</div>
                  <div className="truncate text-xs text-muted">
                    {nodes[at] ? "on a concept near yours" : `on ${CATALOG[at]?.title ?? at}`}
                  </div>
                </div>
                {e.openToMatch && <span className="dot bg-success" role="img" aria-label="Open to learn together" title="Open to learn together" />}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

type Item = { key: string; at: number; node: React.ReactNode };

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
      out.push({
        key: `seed-${run.id}`,
        at: run.at,
        node: <>Added {em(first)}{rest.length ? ` and ${plural(rest.length, "more concept")}` : ""} to your map</>,
      });
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
