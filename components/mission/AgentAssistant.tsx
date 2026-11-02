"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentResult } from "@/domains/agents/contracts";
import { useAIStream } from "@/lib/client/useAIStream";
import ActivityPanel from "@/components/activity/ActivityPanel";
import { useStore } from "@/lib/client/store";
import { BUILDER_VIEW } from "@/lib/builder";
import { CloseIcon } from "@/components/ui/bits";

const OPTIONS = [
  { id: "plan", label: "Plan my next step", hint: "What would you like to understand, and what is getting in the way?" },
  { id: "peers", label: "Find a learning partner", hint: "What would you like to explore with someone?" },
  { id: "sources", label: "Find a useful source", hint: "Describe the documentation, video or explanation you need." },
] as const;
type Task = (typeof OPTIONS)[number]["id"];

export default function AgentAssistant({ onClose, onOpenTopic, question }: { onClose: () => void; onOpenTopic?: (slug: string) => void; question?: string }) {
  const { refreshSnapshot, profile, say, concepts } = useStore();
  const [task, setTask] = useState<Task>("plan");
  const [text, setText] = useState(question ?? "");
  const [result, setResult] = useState<AgentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  const { activity, run: stream, cancel } = useAIStream();
  useEffect(() => {
    input.current?.focus();
    return () => controller.current?.abort();
  }, []);

  const run = async () => {
    const prompt = text.trim() || question?.trim() || profile.currentIntent.trim();
    if (!prompt) { setError("Add a question or a goal first."); return; }
    setBusy(true); setError(null); setResult(null);
    controller.current = new AbortController();
    const agentId = task === "peers" ? "peer-guide" : task === "sources" ? "resource-guide" : "knowledge-map";
    const agentInput = task === "peers" ? { query: prompt, limit: 5 } : task === "sources" ? { query: prompt, kind: "any" } : { text: prompt, objective: "plan" };
    try {
      const response = await stream<AgentResult>(`/api/agents/${agentId}`, {
        method: "POST", body: JSON.stringify({ input: agentInput, idempotencyKey: crypto.randomUUID() }), signal: controller.current.signal,
      });
      setResult(response);
      say("SYSTEM", `${response.agentId} completed · ${response.usage.modelCalls} model calls · ${response.usage.toolCalls} tools`, "ok", response.mode === "fixture");
      await refreshSnapshot();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "The guide couldn't finish. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-2 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="assistant-heading" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <section className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line-2 bg-panel shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <div><h2 id="assistant-heading" className="text-lg font-semibold">Your learning guide</h2><p className="text-xs text-muted">A useful next step, with your map in mind.</p></div>
          <button className="btn btn-icon btn-ghost" aria-label="Close learning guide" onClick={onClose}><CloseIcon /></button>
        </header>
        <div className="scroll min-h-0 space-y-4 p-4">
          <div className="flex flex-wrap gap-2" aria-label="What would help?">
            {OPTIONS.map((option) => <button key={option.id} aria-pressed={task === option.id} disabled={busy} onClick={() => { setTask(option.id); setResult(null); }} className={`rounded-full border px-3 py-2 text-sm ${task === option.id ? "border-accent bg-accent-soft" : "border-line hover:border-dim"}`}>{option.label}</button>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void run(); }}>
            <label className="block text-sm text-muted" htmlFor="assistant-question">{OPTIONS.find((o) => o.id === task)?.hint}</label>
            <textarea id="assistant-question" ref={input} className="field mt-2 min-h-24 resize-y text-base" value={text} onChange={(e) => setText(e.target.value)} placeholder={question || profile.currentIntent || "I want to understand…"} maxLength={5000} disabled={busy} />
            <div className="mt-3 flex items-center gap-3">
              <button className="btn btn-primary" disabled={busy}>{busy ? "Working with your map…" : "Help me take the next step"}</button>
            </div>
          </form>
          <ActivityPanel activity={activity} title="Your learning guide" onCancel={cancel} onRetry={() => void run()} />
          {error && <p role="alert" className="rounded-md border border-err/40 bg-panel-2 p-3 text-sm text-err">{error}</p>}
          {result && <Result result={result} onOpenTopic={onOpenTopic} savedConcepts={concepts} />}
        </div>
      </section>
    </div>
  );
}

function Result({ result, onOpenTopic, savedConcepts }: { result: AgentResult; onOpenTopic?: (slug: string) => void; savedConcepts: Record<string, { title: string }> }) {
  const data = result.data as unknown as Record<string, unknown>;
  const nextSlug = typeof data.root === "string" && savedConcepts[data.root] ? data.root : null;
  const explanation = typeof data.explanation === "string" ? data.explanation : typeof data.answer === "string" ? data.answer : "Your next step is ready.";
  const actions = Array.isArray(data.nextActions) ? data.nextActions.filter((v): v is string => typeof v === "string") : [];
  const peers = Array.isArray(data.peers) ? data.peers as Array<{ id: string; displayName: string; reason: string }> : [];
  const sources = Array.isArray(data.sources) ? data.sources as Array<{ url: string; title: string }> : [];
  return (
    <div className="space-y-3 rounded-lg border border-line bg-bg p-4" aria-live="polite">
      {result.mode === "fixture" && <p className="text-xs font-medium text-warn">Rehearsal response · not a live AI result</p>}
      <p className="whitespace-pre-line text-base leading-relaxed">{explanation}</p>
      {actions.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{actions.map((action) => <li key={action}>{action}</li>)}</ul>}
      {nextSlug && onOpenTopic && <button className="btn btn-primary rounded-lg" onClick={() => onOpenTopic(nextSlug)}>Open {savedConcepts[nextSlug].title} →</button>}
      {peers.length > 0 && <div className="space-y-2">{peers.map((peer) => <div key={peer.id} className="rounded-md border border-line p-3"><p className="font-medium">{peer.displayName}</p><p className="text-sm text-muted">{peer.reason}</p></div>)}<p className="text-xs text-muted">These are suggestions. A session begins only after both people accept a match.</p></div>}
      {sources.length > 0 && <ul className="space-y-2">{sources.filter((s) => /^https?:\/\//i.test(s.url)).map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4 hover:text-mastery">{source.title} ↗</a></li>)}</ul>}
      {BUILDER_VIEW && <details className="border-t border-line pt-3"><summary className="cursor-pointer text-xs text-muted">Agent collaboration · {result.trace.length} steps</summary><ol className="mt-2 space-y-1 text-xs text-muted">{result.trace.map((event) => <li key={event.sequence}>{event.agentId} · {event.kind} · {event.name}</li>)}</ol>{BUILDER_VIEW && <p className="mt-2 break-all font-mono text-2xs text-dim">Run {result.runId} · {result.provider}/{result.model}</p>}</details>}
    </div>
  );
}
