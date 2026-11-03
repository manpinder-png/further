"use client";
// Review: what's slipping, this week's recap, where to pick up, and the growth replay.
// Built only from the learner's own event log; it prompts practice and never scores a person.
import { useMemo } from "react";
import { useStore } from "@/lib/client/store";
import { CloseIcon, NodeIcon, useNow } from "@/components/ui/bits";
import { plural, relTime } from "@/lib/client/format";
import type { LearningPath } from "@/lib/client/learning-paths";
import { resumePoints, slippingConcepts, weeklyRecap, type WeekCounts } from "@/lib/review";

interface ReviewProps {
  paths: LearningPath[];
  onExplainAgain: (slug: string) => void;
  onResume: (questionKey: string, slug: string | null) => void;
  onReplay?: () => void;
  onClose: () => void;
}

export default function Review({ paths, onExplainAgain, onResume, onReplay, onClose }: ReviewProps) {
  const { concepts, nodes, events } = useStore();
  const now = useNow(60_000);
  const slipping = useMemo(() => slippingConcepts(nodes, events, concepts, now), [nodes, events, concepts, now]);
  const recap = useMemo(() => weeklyRecap(events, now), [events, now]);
  const resume = useMemo(() => resumePoints(paths, nodes, events, concepts), [paths, nodes, events, concepts]);
  const explainedEver = useMemo(() => new Set(events.filter(event => event.kind === "explain" && typeof event.payload?.score === "number").map(event => event.slug)).size, [events]);
  return <section className="flex h-full min-h-0 flex-col" aria-label="Review">
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-line pl-4 pr-1"><h2 className="text-sm font-semibold">Review</h2><button className="btn btn-icon btn-ghost min-h-9 border-transparent text-muted" onClick={onClose} aria-label="Close review" title="Close (Esc)"><CloseIcon /></button></header>
    <div className="scroll min-h-0 flex-1 px-4 py-4">
      <h3 className="label">Slipping</h3>
      {slipping.length ? <>
        <p className="mt-1 text-xs text-muted">Explained a while ago and untouched since. Explaining again is the quickest way to keep it.</p>
        <ul className="mt-3 space-y-1">{slipping.slice(0, 6).map(item => <li key={item.slug} className="flex items-center gap-3 rounded-md border border-line bg-panel-2 px-3 py-2"><NodeIcon state={nodes[item.slug]?.state ?? "understood"} mastery={nodes[item.slug]?.mastery ?? 0} size={18} /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{item.title}</span><span className="block text-xs text-muted">Explained {relTime(item.explainedAt, now)} · quiet for {plural(item.daysSince, "day")}</span></span><button className="btn min-h-8 shrink-0 px-2 py-1 text-xs" onClick={() => onExplainAgain(item.slug)}>Explain again</button></li>)}</ul>
        {slipping.length > 6 && <p className="mt-2 text-xs text-dim">{slipping.length - 6} more are waiting; the oldest are listed first.</p>}
      </> : <p className="mt-1 text-sm text-muted">{explainedEver ? "Nothing is slipping. Everything you've explained has been touched recently." : "Once you've explained a concept back, it shows up here when it goes quiet for a few days."}</p>}

      <h3 className="label mt-6">This week</h3>
      <p className="mt-1 text-sm leading-relaxed">{sentence(recap.thisWeek, recap.lastWeek)}</p>
      <dl className="mt-3 grid grid-cols-4 gap-px overflow-hidden rounded-md border border-line bg-line text-center">
        {([["Added", "added"], ["Opened", "opened"], ["Explained", "explained"], ["Sessions", "sessions"]] as const).map(([label, key]) => <div key={key} className="bg-panel py-2"><dd className="text-lg font-semibold tabular-nums">{recap.thisWeek[key]}</dd><dt className="text-2xs text-muted">{label}</dt><dd className="text-2xs text-dim">last wk {recap.lastWeek[key]}</dd></div>)}
      </dl>

      <h3 className="label mt-6">Pick up where you left off</h3>
      {resume.length ? <ul className="mt-2 space-y-1">{resume.slice(0, 4).map(point => <li key={point.key}><button className="flex w-full items-start gap-3 rounded-md border border-line bg-panel-2 px-3 py-2 text-left hover:border-dim" onClick={() => onResume(point.key, point.nextSlug)}><span className="min-w-0 flex-1"><span className="block truncate text-sm" title={point.question}>{point.question}</span><span className="block text-xs text-muted">{point.explained} of {point.total} explained · {point.nextTitle ? `next: ${point.nextTitle}` : "open a concept"} · {relTime(point.lastTouched, now)}</span></span><span className="text-muted" aria-hidden>→</span></button></li>)}</ul> : <p className="mt-1 text-sm text-muted">{paths.length ? "Every question you've asked has all its concepts explained." : "Ask a question and your unfinished paths will be listed here."}</p>}

      {onReplay && <div className="mt-6 border-t border-line pt-4"><button className="text-xs text-muted hover:text-text" onClick={onReplay}><span aria-hidden>▶</span> Replay how this map grew</button></div>}
      <p className="mt-6 text-xs text-dim">Built from your own activity. A reviewed explanation is evidence of practice, not a grade.</p>
    </div>
  </section>;
}

function sentence(week: WeekCounts, last: WeekCounts) {
  const parts: string[] = [];
  if (week.explained) parts.push(`explained ${plural(week.explained, "concept")}`);
  if (week.added) parts.push(`added ${week.added} to your map`);
  if (week.opened && !week.explained) parts.push(`opened ${plural(week.opened, "concept")}`);
  if (week.sessions) parts.push(`learned with someone ${week.sessions === 1 ? "once" : `${week.sessions} times`}`);
  if (!parts.length) return last.explained || last.added || last.opened ? "Quiet week so far. Explaining one concept again is a good restart." : "Nothing yet this week. Open a concept below or ask a new question.";
  const trend = week.explained > last.explained ? " More explanations than last week." : week.explained < last.explained ? ` Last week you explained ${last.explained}.` : "";
  return `This week you ${parts.join(", ")}.${trend}`;
}
