"use client";
import { useEffect, useState } from "react";
import type { ActivityState } from "@/domains/ui/activity";

const NAMES: Record<string, string> = { "knowledge-map": "Path guide", metadata: "Question interpreter", "peer-guide": "Peer guide", "learning-companion": "Learning companion", "resource-guide": "Source finder", perception: "Image guide", transcribe: "Voice transcription", backend: "Saving and checking" };
const FIELDS: Record<string, string> = { body: "Response", answer: "Answer", explanation: "Explanation", intent: "Your learning question", description: "What the image shows", suggestedCuriosity: "Suggested question", transcript: "Transcript" };
const PRIORITY = ["transcript", "body", "answer", "explanation", "suggestedCuriosity", "description", "intent"];

export default function ActivityPanel({ activity, title, onCancel, onRetry, compact = false }: { activity: ActivityState; title: string; onCancel?: () => void; onRetry?: () => void; compact?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (activity.status !== "running") return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [activity.status, activity.startedAt]);
  if (activity.status === "idle") return null;
  const running = activity.status === "running";
  const elapsed = Math.max(0, Math.floor(((activity.finishedAt ?? now) - activity.startedAt) / 1000));
  const silent = Math.max(0, Math.floor((now - activity.lastEventAt) / 1000));
  const latest = activity.events.at(-1);
  const agents = [...new Set(activity.events.map((event) => event.agentId))];
  const drafts = Object.values(activity.drafts).filter((draft) => draft.text).sort((a, b) => {
    const aOrder = activity.events.findLastIndex((event) => event.agentId === a.agentId);
    const bOrder = activity.events.findLastIndex((event) => event.agentId === b.agentId);
    return bOrder - aOrder || PRIORITY.indexOf(a.field) - PRIORITY.indexOf(b.field);
  });
  const primary = drafts[0];
  const eventList = <ol className="mt-3 max-h-44 space-y-2 overflow-y-auto text-xs leading-relaxed text-muted">{activity.events.map((event, index) => <li key={`${event.sequence}-${index}`}><span className="text-text">{NAMES[event.agentId] ?? "Guide"}</span><span className="mx-1.5">·</span>{event.label}{event.targetAgentId && <span> → {NAMES[event.targetAgentId] ?? "Another guide"}</span>}</li>)}</ol>;
  if (activity.status === "completed" && !activity.notice) return <details className="my-2 text-xs text-muted" aria-label={`${title} progress`}><summary className="flex cursor-pointer list-none flex-wrap items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-mastery" /><span>Response ready</span><span className="text-dim">· {elapsed}s</span><span className="ml-auto text-dim">View activity ⌄</span></summary>{eventList}</details>;
  const status = running ? latest?.label ?? "Connecting to your guide…" : activity.status === "completed" ? "Response ready" : activity.status === "cancelled" ? "Paused" : "Couldn't finish";
  return <section className={`rounded-xl border ${activity.status === "error" ? "border-err/40" : "border-mastery/25"} bg-panel-2 ${compact ? "p-3" : "p-4 sm:p-5"}`} aria-label={`${title} progress`}>
    <div className="flex flex-wrap items-center gap-2"><span className={`h-2 w-2 rounded-full ${running ? "animate-pulse bg-mastery" : "bg-muted"}`} aria-hidden /><h3 className="min-w-0 flex-1 text-sm font-medium">{title}</h3><span className="text-xs tabular-nums text-muted">{elapsed}s</span>{running && onCancel && <button type="button" className="btn btn-ghost min-h-8 rounded-md px-2 text-xs" onClick={onCancel}>Stop</button>}{!running && activity.status !== "completed" && onRetry && <button type="button" className="btn min-h-8 rounded-md px-2 text-xs" onClick={onRetry}>Try again</button>}</div>
    <p className="mt-2 text-xs leading-relaxed text-muted" role="status">{latest && running ? `${NAMES[latest.agentId] ?? "Guide"} · ` : ""}{status}</p>
    {primary && <div className="mt-4 border-t border-line pt-4"><div className="mb-3 flex flex-wrap items-center gap-2 text-xs"><span className="text-mastery">{running ? "Live response" : "Unfinished response"}</span><span className="text-dim">· {FIELDS[primary.field] ?? "Draft"}</span></div><div className={`${compact ? "max-h-[32dvh]" : "max-h-[45dvh]"} overflow-y-auto`}><p className="whitespace-pre-wrap break-words text-[15px] leading-[1.75] text-text/95">{primary.text}<span className={running ? "ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-mastery align-middle" : "hidden"} aria-hidden /></p></div><p className="mt-3 text-xs text-dim">{running ? "Still being written. Your path updates after the response is checked and saved." : "This draft hasn't been applied."}</p></div>}
    {running && silent >= 15 && <p className="mt-3 text-xs text-muted">Still waiting for the next update ({silent}s). You can wait or stop this request.</p>}
    {activity.error && <p className="mt-3 text-sm text-err" role="alert">{activity.error}</p>}
    {activity.notice && <p className="mt-3 text-sm text-warn" role="status">{activity.notice}</p>}
    {running && latest?.audioProcessedMs !== undefined && <p className="mt-2 text-xs text-muted">Transcribed {(latest.audioProcessedMs / 1000).toFixed(1)} seconds of audio</p>}
    {activity.events.length > 0 && <details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-xs text-muted">{agents.length > 1 ? `${agents.length} collaborators` : "Guide activity"} · See steps</summary>{eventList}{drafts.length > 1 && <div className="mt-4 border-t border-line pt-3">{drafts.slice(1).map((draft) => <div key={`${draft.agentId}:${draft.field}`} className="mb-3"><p className="text-xs text-dim">{NAMES[draft.agentId]} · {FIELDS[draft.field]}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted">{draft.text}</p></div>)}</div>}</details>}
  </section>;
}

/** Non-AI work has real elapsed time, without pretending to stream a model response. */
export function OperationStatus({ label, detail }: { label: string; detail: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const started = Date.now(); const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000); return () => clearInterval(timer); }, []);
  return <div className="rounded-lg border border-line bg-panel px-3 py-3" role="status"><p className="text-sm">{label}<span className="ml-2 text-xs tabular-nums text-muted">{seconds}s</span></p><p className="mt-1 text-xs text-muted">{detail}</p></div>;
}
