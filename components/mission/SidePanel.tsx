"use client";
// The single side panel beside the map. Top: which question the map is showing.
// Middle: that question's path, or the open concept/topic/learner card. Bottom:
// a one-line progress summary, peer discovery and the question composer.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMapStats, usePath, useStore } from "@/lib/client/store";
import { plural } from "@/lib/client/format";
import { explanationFor, orderPath, type LearningPath } from "@/lib/client/learning-paths";
import { useExpand, useMatchJob } from "@/lib/client/hooks";
import ActivityPanel, { OperationStatus } from "@/components/activity/ActivityPanel";
import CommandBar from "@/components/mission/CommandBar";

export type PanelView = "question" | "knowledge" | "geomind";

interface SidePanelProps {
  view: PanelView;
  paths: LearningPath[];
  activeQuestionKey?: string;
  onChooseQuestion: (key: string) => void;
  activeSlugs?: string[];
  /** True when nothing is open and the question's path should fill the body. */
  showPath: boolean;
  onSelectTopic: (slug: string) => void;
  question?: string;
  onComplete: () => void;
  onOpenTopic: (slug: string) => void;
  /** On phones the panel is a bottom sheet: closed shows only the composer. */
  mobileSheet?: { open: boolean; onToggle: () => void };
  /** The saved run behind the current question; enables Keep exploring. */
  extendsRunId?: string;
  children?: React.ReactNode;
}

export default function SidePanel({ view, paths, activeQuestionKey, onChooseQuestion, activeSlugs, showPath, onSelectTopic, question, onComplete, onOpenTopic, mobileSheet, extendsRunId, children }: SidePanelProps) {
  const stats = useMapStats();
  const heading = view === "knowledge" ? "My knowledge map" : view === "geomind" ? "Geomind" : null;
  const collapsed = Boolean(mobileSheet && !mobileSheet.open);
  return <div className="flex h-full min-h-0 flex-col">
    {mobileSheet && <button type="button" className="flex h-7 w-full shrink-0 items-center justify-center" onClick={mobileSheet.onToggle} aria-expanded={mobileSheet.open} aria-label={mobileSheet.open ? "Hide the panel" : "Show your path"}><span className="h-1 w-10 rounded-full bg-line-2" aria-hidden /></button>}
    {!collapsed && <>
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
      {heading ? <h2 className="text-sm font-semibold">{heading}</h2> : paths.length ? <>
        <label htmlFor="panel-question" className="shrink-0 text-xs text-muted">Question</label>
        <select id="panel-question" aria-label="Which question the map shows" title={question} className="min-w-0 flex-1 truncate bg-transparent py-1 text-sm text-text outline-none" value={activeQuestionKey ?? ""} onChange={(event) => onChooseQuestion(event.target.value)}>
          {paths.map((path) => <option key={path.key} value={path.key}>{path.question}</option>)}
        </select>
      </> : <h2 className="text-sm font-semibold">Your first question</h2>}
    </header>
    <div className="scroll min-h-0 flex-1">{showPath ? <PathList activeSlugs={activeSlugs} onSelectTopic={onSelectTopic} question={question} extendsRunId={extendsRunId} /> : children}</div>
    {/* The summary row steps aside while a card is open so the lesson gets the height. */}
    {showPath && <div className="shrink-0 border-t border-line px-3 py-2 text-xs text-muted">
      <Link href="/profile" className="hover:text-text" title="Your progress, activity and sessions">{plural(stats.concepts, "concept")} · {stats.understood} explained</Link>
      <FindPeer activeSlugs={activeSlugs} />
    </div>}
    </>}
    <CommandBar variant="panel" onComplete={onComplete} question={question} onOpenTopic={onOpenTopic} />
  </div>;
}

/* ---------- Path ---------- */

function useRailPath(activeSlugs?: string[]) {
  const suggested = usePath();
  const { concepts, edges, nodes, events } = useStore();
  return useMemo(() => activeSlugs === undefined ? suggested.filter(step => concepts[step.slug] && nodes[step.slug]) : orderPath(activeSlugs.filter(slug => concepts[slug]), edges).map(slug => ({
    slug, title: concepts[slug].title,
    reason: explanationFor(slug, events) ? "Explanation reviewed · try another example" : nodes[slug]?.state === "seeded" ? "Start with a concrete example" : "Continue exploring",
  })), [activeSlugs, suggested, concepts, edges, nodes, events]);
}

export function PathList({ activeSlugs, onSelectTopic, question, extendsRunId }: { activeSlugs?: string[]; onSelectTopic: (slug: string) => void; question?: string; extendsRunId?: string }) {
  const path = useRailPath(activeSlugs);
  const { selected, concepts, missions, dataMode } = useStore();
  const { run: expand, activity, cancel, retry, error } = useExpand();
  const pending = missions.filter(mission => mission.status !== "done");
  // Keep exploring adds 3–5 new concepts to this same question, anchored on its root concept.
  const canExtend = Boolean(extendsRunId && question && path.length) && dataMode === "local";
  const extend = () => { if (!question || !path.length) return; void expand(`Keep exploring: ${question}`, "text", undefined, undefined, { focus: { slug: path[0].slug, title: question, siblings: path.map(step => step.slug) }, extendsRunId }); };
  return <div className="px-3 py-3">
    {pending.slice(0, 3).map(mission => <div key={mission.id} className="mb-2 rounded-md border border-line bg-panel-2 px-3 py-2"><p className="truncate text-sm" title={mission.text}>{mission.text}</p><p className={`mt-0.5 text-xs ${mission.status === "error" ? "text-err" : "text-muted"}`}>{mission.status === "error" ? "Couldn't add concepts. Retry in the question box." : "Adding concepts…"}</p></div>)}
    {!path.length ? <p className="px-1 py-2 text-sm leading-relaxed text-muted">{Object.keys(concepts).length ? "Choose a saved question above, or open a topic on your knowledge map." : "Ask about anything you're curious about. Your map and a suggested path will appear here, and when you're ready you can find someone learning the same thing."}</p> : <>
      <div className="mb-2 flex items-baseline justify-between px-1"><h3 className="label">Your path</h3><span className="text-xs text-dim">{plural(path.length, "step")}</span></div>
      <ol className="relative" aria-label="Suggested order">
        <span className="absolute bottom-4 left-[11px] top-4 w-px bg-line-2" aria-hidden />
        {path.map((s, i) => (
          <li key={s.slug} className="relative">
            <button
              className={`flex w-full items-start gap-3 rounded-md py-2 pr-2 text-left hover:bg-panel-2 ${selected === s.slug ? "bg-panel-2" : ""}`}
              aria-current={selected === s.slug ? "step" : undefined}
              onClick={() => onSelectTopic(s.slug)}
            >
              <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold tabular-nums ${i === 0 ? "border-mastery bg-mastery-soft text-mastery" : "border-line-2 bg-panel text-muted"}`}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm">{s.title}</span>
                  {i === 0 && <span className="shrink-0 text-2xs font-medium text-mastery">{activeSlugs === undefined ? "Next up" : "Start here"}</span>}
                </span>
                <span className="block text-xs text-muted">{s.reason}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-3 px-1 text-xs text-dim">Open a step here or on the map to learn it, explain it back, or follow a source.</p>
      {canExtend && <div className="mt-4 border-t border-line pt-3">
        <ActivityPanel activity={activity} title="Growing this question" onCancel={cancel} onRetry={() => { void retry(); }} compact />
        {error && activity.status !== "error" && <p className="mb-2 text-xs text-err" role="alert">{error}</p>}
        <button type="button" className="btn w-full" onClick={extend} disabled={activity.status === "running"} title="Add 3–5 new concepts to this question">{activity.status === "running" ? "Adding concepts…" : "Keep exploring this question"}</button>
        <p className="mt-2 px-1 text-xs text-dim">New concepts join this path. Open any concept and choose Go deeper to branch from it instead.</p>
      </div>}
    </>}
  </div>;
}

/* ---------- Peer discovery ---------- */

/** Learning with others is a first-class part of the product, so its state is always visible here, not only a button. */
function FindPeer({ activeSlugs }: { activeSlugs?: string[] }) {
  const { profile, match, explorers } = useStore();
  const runMatch = useMatchJob();
  const [looking, setLooking] = useState<"idle" | "looking" | "none">("idle");
  const [message, setMessage] = useState<string | null>(null);
  if (match) return <p className="mt-2 text-xs text-mastery" role="status">A learning partner is lined up. Watch for the invitation on the map.</p>;
  const available = explorers.filter(peer => peer.openToMatch && (!activeSlugs || activeSlugs.length === 0 || peer.activeConcepts.some(slug => activeSlugs.includes(slug))));
  const anyone = explorers.filter(peer => peer.openToMatch).length;
  const find = async () => {
    setMessage(null);
    setLooking("looking");
    try {
      const found = await runMatch({ quietIfNone: true, ...(activeSlugs === undefined ? {} : { conceptSlugs: activeSlugs }) });
      setLooking(found ? "idle" : "none");
    } catch { setMessage("Couldn't search for a peer. Please try again."); setLooking("idle"); }
  };
  return <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-panel-2 px-3 py-2">
    <PeopleIcon />
    <span className="min-w-0 flex-1 leading-snug">
      <span className="block text-sm text-text">Learn with someone</span>
      <span className="block">{!profile.openToMatch ? <>Matching is off. <Link href="/profile" className="underline underline-offset-2 hover:text-text">Turn it on in Profile</Link> to be found.</> : looking === "none" ? "No one is on these topics right now. Keep exploring and try again later." : available.length ? `${plural(available.length, "learner")} on these topics right now` : anyone ? `${plural(anyone, "learner")} available · none on these topics yet` : "A 10-minute conversation starts when you both accept."}</span>
      {message && <span className="block text-warn" role="status">{message}</span>}
    </span>
    {profile.openToMatch && (looking === "looking" ? <span className="w-full"><OperationStatus label="Checking available learners" detail="Shared topics, a common language and enough time." /></span> : <button type="button" className="btn min-h-8 shrink-0 px-2 py-1 text-xs" onClick={find} disabled={activeSlugs?.length === 0} title="Find a learner on this question. You both accept before anything opens.">Find a partner</button>)}
  </div>;
}

const PeopleIcon = () => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-mastery" aria-hidden><circle cx="6.5" cy="6" r="2.5" /><circle cx="12.5" cy="7" r="2" /><path d="M2 15c.5-2.5 2.3-4 4.5-4s4 1.5 4.5 4M11 11.2c2.2-.3 4 1 4.5 3.3" /></svg>;
