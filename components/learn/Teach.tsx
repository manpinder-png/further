"use client";
// Saved lessons reopen without inference; replacing one is an explicit action.
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/client/store";
import { learnerModel } from "@/lib/learn";
import { mutationKey } from "@/domains/ui/contracts";
import { useAIStream } from "@/lib/client/useAIStream";
import { canUseNewRequestKey } from "@/lib/client/stream";
import { lessonPracticeSaved } from "@/lib/client/lesson-state";
import ActivityPanel, { OperationStatus } from "@/components/activity/ActivityPanel";

interface TeachData {
  format: string;
  title: string;
  body: string;
  interaction?: { prompt: string; options: { label: string; reveal: string }[] };
  branches: { title: string; why: string }[];
  challenge?: { kind: string; prompt: string; options: string[]; correct: number; explanation: string };
  adaptedNote: string;
  demo: boolean;
  restored?: boolean;
  runId: string;
}

// A lesson, once Muse writes it, never regenerates under the reader.
const TEACH_CACHE = new Map<string, TeachData>();
const cacheKey = (actor: string, slug: string, round: number) => `${actor}:${slug}:v4-depth${round}`;

export default function Teach({ slug, title, onBranch, onComplete }: { slug: string; title: string; onBranch?: (title: string) => Promise<void>; onComplete?: () => void }) {
  const { nodes, events, track, say, actorId, dataMode, modelMode } = useStore();
  const cacheActor = `${dataMode}:${modelMode}:${actorId ?? "sample"}`;
  const [round, setRound] = useState(1);
  const [data, setData] = useState<TeachData | null>(() => TEACH_CACHE.get(cacheKey(cacheActor, slug, 1)) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [regenerate, setRegenerate] = useState(false);
  const request = useRef({ target: "", key: "", retryWithNewKey: false });
  const [picked, setPicked] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [branching, setBranching] = useState<string | null>(null);
  const [guess, setGuess] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const { activity, run: stream, cancel } = useAIStream();
  const done = lessonPracticeSaved(slug, data?.runId, events);
  const retry = () => {
    if (request.current.retryWithNewKey) request.current = { ...request.current, key: mutationKey(), retryWithNewKey: false };
    setAttempt((value) => value + 1);
  };

  useEffect(() => {
    setPicked(null); setGuess(null); setSolved(false); setBranching(null);
    if (TEACH_CACHE.has(cacheKey(cacheActor, slug, round)) && attempt === 0) { setData(TEACH_CACHE.get(cacheKey(cacheActor, slug, round))!); return; }
    setData(null); setError(null);
    const target = `${cacheActor}:${slug}:${round}`;
    if (request.current.target !== target) request.current = { target, key: mutationKey(), retryWithNewKey: false };
    let cancelled = false;
    let timedOut = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, 120_000);
    stream<TeachData>("/api/teach", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": request.current.key },
      body: JSON.stringify({ slug, learnerSummary: learnerModel(nodes, events).summary, depth: round, regenerate }),
      signal: ctrl.signal,
    })
      .then((d) => {
        if (cancelled) return;
        TEACH_CACHE.set(cacheKey(cacheActor, slug, round), d);
        setData(d);
        say("EXPAND", `Muse chose “${d.format}” to teach ${title}`, "ok", d.demo);
      })
      .catch((e: Error) => {
        // Our own cleanup (React double-mount, slug change) aborts the first
        // request — that is not a timeout and must never surface as one.
        if (cancelled) return;
        request.current.retryWithNewKey = canUseNewRequestKey(e);
        if (e.name === "AbortError") { setError(timedOut ? "This lesson took too long to write. Try again." : "Stopped waiting for this lesson. You can retry when ready."); return; }
        setError(e.message);
      })
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; clearTimeout(timer); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, attempt, round, cacheActor, regenerate]);

  if (error)
    return (
      <section className="px-4 py-3" aria-labelledby="learn-h">
        <h4 id="learn-h" className="label mb-1.5">Learn</h4>
        <ActivityPanel activity={activity} title="Preparing your lesson" onRetry={retry} />
        <p className="mt-2 text-sm text-muted">{error}</p>
      </section>
    );
  if (!data)
    return (
      <section className="px-4 py-3" aria-labelledby="learn-h" aria-busy="true">
        <h4 id="learn-h" className="label mb-2">Learn</h4>
        <ActivityPanel activity={activity} title="Preparing your lesson" onCancel={cancel} onRetry={retry} />
      </section>
    );

  const finish = async () => {
    setSaving(true);
    const saved = await track(slug, "watch", { format: data.format, depth: round, lessonRunId: data.runId, ...(data.challenge ? { practice: { answerIndex: guess, selfChecked: true } } : {}) });
    setSaving(false);
    if (saved) { say("SYSTEM", `practice saved via ${data.format}`, "ok"); onComplete?.(); }
  };
  const skip = () => {
    // "Not my thing" is about the FORMAT, not the concept: stay here and teach it another way.
    track(slug, "skip", { format: data.format });
    say("SYSTEM", `skipped ${data.format} → re-teach this concept differently`, "warn");
    TEACH_CACHE.delete(cacheKey(cacheActor, slug, round));
    request.current = { target: `${cacheActor}:${slug}:${round}`, key: mutationKey(), retryWithNewKey: false };
    setRegenerate(true);
    setAttempt((a) => a + 1);
  };

  return (
    <section className="px-4 py-3" aria-labelledby="learn-h">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 id="learn-h" className="label">Learn{round > 1 ? ` · going deeper` : ""}</h4>
        <span className="rounded-full border border-line-2 px-2 py-0.5 text-2xs text-muted" title="Picked for how you learn">{data.format}</span>
      </div>
      {data.demo && <p className="mb-2 text-xs text-muted">Sample lesson · demonstration only</p>}
      <ActivityPanel activity={activity} title="Lesson preparation" compact />
      {data.restored && <p className="mt-2 text-xs text-muted">Saved lesson · reopened without a new AI request.</p>}
      {saving && <OperationStatus label="Saving your completed practice" detail="Waiting for your learning event to be saved." />}
      {/* The demo chooser's note is an internal profile dump; learners only see a real, model-written note. */}
      {data.adaptedNote && !data.demo && <details className="my-3"><summary className="cursor-pointer text-xs text-muted">Why this approach?</summary><p className="mt-2 text-sm text-muted">{data.adaptedNote}</p></details>}
      <h5 className="mt-4 text-xl font-semibold leading-snug">{data.title}</h5>
      <div className="mt-4 space-y-4 text-[16px] leading-[1.8] text-text/90">{data.body.split(/\n\s*\n/).map((paragraph, index) => <p key={index} className="whitespace-pre-line">{paragraph}</p>)}</div>

      {data.interaction && !done && (
        <div className="mt-3">
          <p className="text-sm font-medium">{data.interaction.prompt}</p>
          <div className="mt-2 grid gap-1.5">
            {data.interaction.options.map((o, i) => (
              <button key={i} onClick={() => setPicked(i)} aria-pressed={picked === i} className={`rounded-md border px-3 py-2 text-left text-sm ${picked === i ? "border-accent bg-panel-2" : "border-line hover:border-dim"}`}>{o.label}</button>
            ))}
          </div>
          {picked !== null && <p className="mt-2 border-l-2 border-mastery pl-3 text-sm leading-relaxed text-text/90" aria-live="polite">{data.interaction.options[picked].reveal}</p>}
        </div>
      )}

      {data.challenge && !done && (
        <div className="mt-3 rounded-md border border-line bg-panel-2 px-3 py-2.5">
          <div className="text-2xs uppercase tracking-[0.12em] text-mastery">Practice · {data.challenge.kind.replace(/-/g, " ")}</div>
          <p className="mt-1 text-sm font-medium">{data.challenge.prompt}</p>
          <div className="mt-2 grid gap-1.5">
            {data.challenge.options.map((o, i) => {
              const right = solved && i === data.challenge!.correct;
              const wrong = guess === i && !right;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={solved}
                  onClick={() => {
                    setGuess(i);
                    if (i === data.challenge!.correct) {
                      setSolved(true);
                      say("SYSTEM", "Practice answer revealed. This is not an evaluated explain-back score.", "info");
                    }
                  }}
                  className={`rounded-md border px-3 py-2 text-left text-sm disabled:cursor-default ${right ? "border-success bg-success/10 text-success" : wrong ? "border-line text-muted line-through decoration-dim" : "border-line hover:border-dim"}`}
                >
                  {o}{right ? " ✓" : ""}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted" aria-live="polite">{solved ? data.challenge.explanation : guess !== null ? "Not quite. Try another, wrong guesses cost nothing." : "Solve this to finish. Wrong guesses cost nothing."}</p>
        </div>
      )}

      {done ? <div className="mt-6 rounded-xl border border-line bg-panel-2 p-4">
        <p className="text-sm text-mastery">Practice saved.</p><p className="mt-2 text-sm text-muted">Try putting this in your own words, or explore an example from another angle.</p>
        <div className="mt-4 flex flex-wrap gap-2"><button className="btn btn-primary rounded-lg" onClick={onComplete}>Try explaining it</button>{round < 5 && <button className="btn btn-ghost rounded-lg" onClick={() => { setRegenerate(false); setAttempt(0); setRound((value) => value + 1); }}>Explore another example</button>}</div>
      </div> : <div className="mt-6 flex flex-wrap gap-2"><button className="btn btn-primary rounded-lg" onClick={() => void finish()} disabled={saving || (data.interaction ? picked === null : false) || (data.challenge ? !solved : false)}>{saving ? "Saving…" : "I've tried this · explain it next"}</button><button className="btn btn-ghost rounded-lg text-muted" onClick={skip}>Explain another way</button></div>}
      {data.branches.length > 0 && <details className="mt-6 border-t border-line pt-4"><summary className="cursor-pointer text-sm text-muted">Follow a different question</summary><p className="mt-2 text-xs text-muted">Opens a separate path. This one stays saved.</p><div className="mt-3 grid gap-2">{data.branches.map((branch) => <button key={branch.title} disabled={branching !== null} onClick={() => { setBranching(branch.title); void (async () => { try { await onBranch?.(branch.title); } finally { setBranching(null); } })(); }} className="rounded-xl border border-line p-4 text-left hover:border-dim"><span className="block text-sm">{branching === branch.title ? "Finding a new starting point…" : branch.title + " →"}</span><span className="mt-1 block text-xs text-muted">{branch.why}</span></button>)}</div></details>}
      <p className="mt-5 text-xs text-dim">AI explanations can simplify or miss details. Sources and your own examples help check them.</p>
    </section>
  );
}
