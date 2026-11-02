"use client";
import { useEffect, useState } from "react";
import type { ActivityState } from "@/domains/ui/activity";

const NAMES: Record<string, string> = { "knowledge-map": "Map assistant", metadata: "Metadata agent", "peer-guide": "Peer guide", "learning-companion": "Learning companion", "resource-guide": "Resource guide", perception: "Perception agent", transcribe: "Voice transcription", backend: "Local service" };
const FIELD_LABELS: Record<string, string> = { body: "Response", answer: "Answer", explanation: "Explanation", intent: "Learning goal", description: "Image description", suggestedCuriosity: "Suggested question", transcript: "Transcript" };
const FIELD_PRIORITY = ["transcript", "body", "answer", "explanation", "suggestedCuriosity", "description", "intent"];
export default function ActivityPanel({ activity, title, onCancel, onRetry, compact = false }: { activity: ActivityState; title: string; onCancel?: () => void; onRetry?: () => void; compact?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (activity.status !== "running") return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [activity.status, activity.startedAt]);
  if (activity.status === "idle") return null;
  const running = activity.status === "running";
  const elapsed = Math.max(0, Math.floor(((activity.finishedAt ?? now) - activity.startedAt) / 1000));
  const silent = Math.max(0, Math.floor((now - activity.lastEventAt) / 1000));
  const latest = activity.events.at(-1);
  const drafts = Object.values(activity.drafts).filter((draft) => draft.text).sort((a, b) => FIELD_PRIORITY.indexOf(a.field) - FIELD_PRIORITY.indexOf(b.field));
  const status = running ? latest?.label ?? "Connecting and waiting for the first server update…" : activity.status === "completed" ? "Final response received" : activity.status === "cancelled" ? "Stopped waiting" : "Could not finish";
  return (
    <section className={`rounded-lg border ${activity.status === "error" ? "border-err/40" : "border-line-2"} bg-panel-2 ${compact ? "p-3" : "p-4"}`} aria-label={`${title} progress`}>
      <div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 flex-1 text-sm font-medium">{title}</h3><span className="text-xs tabular-nums text-muted">{elapsed}s</span>{running && onCancel && <button type="button" className="btn btn-ghost min-h-8 px-2 text-xs" onClick={onCancel}>Cancel</button>}{!running && activity.status !== "completed" && onRetry && <button type="button" className="btn min-h-8 px-2 text-xs" onClick={onRetry}>Retry</button>}</div>
      <p className="mt-1 text-xs text-muted" role="status">{latest && running ? `${NAMES[latest.agentId] ?? latest.agentId} · ` : ""}{status}</p>
      {drafts.length > 0 && <div className="mt-2 border-t border-line pt-2"><p className="mb-2 text-2xs font-medium uppercase tracking-wide text-mastery">{running ? "Streaming draft · not final or saved" : "Interrupted draft · not applied"}</p><div className={`${compact ? "max-h-[24dvh]" : "max-h-80"} space-y-3 overflow-y-auto`}>{drafts.map((draft) => <div key={`${draft.agentId}:${draft.field}`}><p className="mb-1 text-2xs text-dim">{NAMES[draft.agentId] ?? draft.agentId} · {FIELD_LABELS[draft.field] ?? draft.field}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text/90">{draft.text}</p></div>)}</div></div>}
      {running && silent >= 15 && <p className="mt-2 text-xs text-muted">No new update for {silent}s. The request may still be processing; you can keep waiting or cancel.</p>}
      {activity.error && <p className="mt-2 text-sm text-err" role="alert">{activity.error}</p>}
      {activity.notice && <p className="mt-2 text-sm text-warn" role="status">{activity.notice}</p>}
      {running && latest?.audioProcessedMs !== undefined && <p className="mt-2 text-xs text-muted">Audio processed: {(latest.audioProcessedMs / 1000).toFixed(1)}s</p>}
      {activity.events.length > 0 && <details open={running && drafts.length === 0} className="mt-3"><summary className="cursor-pointer text-xs text-muted">Agent activity · {activity.events.length} updates</summary><ol className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-muted">{activity.events.map((event, index) => <li key={`${event.sequence}-${index}`}><span className="text-text">{NAMES[event.agentId] ?? event.agentId}</span> · {event.label}{event.targetAgentId && <span> → {NAMES[event.targetAgentId] ?? event.targetAgentId}</span>}</li>)}</ol></details>}
    </section>
  );
}

/** Non-AI work gets honest operation status, never invented token progress. */
export function OperationStatus({ label, detail }: { label: string; detail: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const started = Date.now(); const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000); return () => clearInterval(timer); }, []);
  return <div className="rounded-md border border-line bg-panel px-3 py-2" role="status"><p className="text-sm">{label}<span className="ml-2 text-xs tabular-nums text-muted">{seconds}s</span></p><p className="mt-1 text-xs text-muted">{detail}</p></div>;
}
