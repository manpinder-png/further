"use client";
// One teaching moment, in whatever format Muse chose for this learner (Connor).
// Finishing (watch +0.2 mastery) or skipping (−0.3 interest) feeds the MD
// §5.4 decay model and the format affinities Muse learns from next time.
// Lives in the concept panel (DESIGN D40). Learner copy never names the model.
import { useEffect, useState } from "react";
import { useStore } from "@/lib/client/store";
import { learnerModel } from "@/lib/learn";
import { BUILDER_VIEW } from "@/lib/builder";
import { useAIStream } from "@/lib/client/useAIStream";
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
}

// A lesson, once Muse writes it, never regenerates under the reader.
const TEACH_CACHE = new Map<string, TeachData>();
const cacheKey = (actor: string, slug: string, round: number) => `${actor}:${slug}:v3-depth${round}`;

export default function Teach({ slug, title, onBranch }: { slug: string; title: string; onBranch?: (title: string) => void }) {
  const { nodes, events, track, say, actorId, dataMode } = useStore();
  const cacheActor = `${dataMode}:${actorId ?? "sample"}`;
  const [round, setRound] = useState(1);
  const [data, setData] = useState<TeachData | null>(() => TEACH_CACHE.get(cacheKey(cacheActor, slug, 1)) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [branching, setBranching] = useState<string | null>(null);
  const [guess, setGuess] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const { activity, run: stream, cancel } = useAIStream();

  useEffect(() => {
    setPicked(null); setDone(false); setGuess(null); setSolved(false); setBranching(null);
    if (TEACH_CACHE.has(cacheKey(cacheActor, slug, round)) && attempt === 0) { setData(TEACH_CACHE.get(cacheKey(cacheActor, slug, round))!); return; }
    setData(null); setError(null);
    let cancelled = false;
    let timedOut = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, 120_000);
    stream<TeachData>("/api/teach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, learnerSummary: learnerModel(nodes, events).summary, depth: round }),
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
        if (e.name === "AbortError") { setError(timedOut ? "This lesson took too long to write. Try again." : "Stopped waiting for this lesson. You can retry when ready."); return; }
        setError(e.message);
      })
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; clearTimeout(timer); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, attempt, round, cacheActor]);

  if (error)
    return (
      <section className="border-b border-line px-4 py-3" aria-labelledby="learn-h">
        <h4 id="learn-h" className="label mb-1.5">Learn</h4>
        <ActivityPanel activity={activity} title="Preparing your lesson" onRetry={() => setAttempt((a) => a + 1)} />
        <p className="mt-2 text-sm text-muted">{error}</p>
      </section>
    );
  if (!data)
    return (
      <section className="border-b border-line px-4 py-3" aria-labelledby="learn-h" aria-busy="true">
        <h4 id="learn-h" className="label mb-2">Learn</h4>
        <ActivityPanel activity={activity} title="Preparing your lesson" onCancel={cancel} onRetry={() => setAttempt((a) => a + 1)} />
      </section>
    );

  const finish = async () => {
    setSaving(true);
    const saved = await track(slug, "watch", { format: data.format, ...(data.challenge ? { practice: { answerIndex: guess, selfChecked: true } } : {}) });
    setSaving(false);
    if (saved) { setDone(true); say("SYSTEM", `completion saved via ${data.format}`, "ok"); }
  };
  const skip = () => {
    // "Not my thing" is about the FORMAT, not the concept: stay here and teach it another way.
    track(slug, "skip", { format: data.format });
    say("SYSTEM", `skipped ${data.format} → re-teach this concept differently`, "warn");
    TEACH_CACHE.delete(cacheKey(cacheActor, slug, round));
    setAttempt((a) => a + 1);
  };
  const mastery = nodes[slug]?.mastery ?? 0;

  return (
    <section className="border-b border-line px-4 py-3" aria-labelledby="learn-h">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 id="learn-h" className="label">Learn{round > 1 ? ` · going deeper` : ""}</h4>
        <span className="rounded-full border border-line-2 px-2 py-0.5 text-2xs text-muted" title="Picked for how you learn">{data.format}</span>
      </div>
      {data.demo && <p className="mb-2 text-xs text-muted">Sample lesson · demonstration only</p>}
      <ActivityPanel activity={activity} title="Lesson preparation" compact />
      {saving && <OperationStatus label="Saving your completed practice" detail="Waiting for the local database to acknowledge this learning event." />}
      {/* The demo chooser's note is an internal profile dump; learners only see a real, model-written note. */}
      {(!data.demo || BUILDER_VIEW) && <p className="mb-2 text-xs italic text-muted">{data.adaptedNote}{data.demo && " (demo chooser)"}</p>}
      <h5 className="text-lg font-semibold leading-snug">{data.title}</h5>
      <p className="mt-1.5 text-base leading-relaxed text-text/90">{data.body}</p>

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

      {done ? (
        nodes[slug]?.state === "understood" ? (
          <div className="mt-3">
            <p className="text-sm text-success">Understood. It glows on your map now. Go deeper, or pick a new path:</p>
            <div className="mt-2 grid gap-1.5">
              {data.branches.map((b) => (
                <button key={b.title} disabled={branching !== null} onClick={() => { setBranching(b.title); onBranch?.(b.title); }} className="rounded-md border border-line px-3 py-2 text-left hover:border-dim disabled:opacity-60">
                  <span className="block text-sm">{branching === b.title ? "Growing that path on your map…" : <>{b.title} <span aria-hidden>→</span></>}</span>
                  <span className="block text-xs text-muted">{b.why}</span>
                </button>
              ))}
            </div>
            <button className="btn btn-ghost mt-2 w-full" onClick={() => setRound((r) => r + 1)}>Keep going on {title}</button>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-muted">Getting there: {Math.round(Math.min(1, mastery / 0.7) * 100)}% of the way to understood. Go one level deeper, or explain it back below.</p>
            <button className="btn btn-primary mt-2 w-full" onClick={() => setRound((r) => r + 1)}>Go deeper on {title}</button>
            {data.branches.length > 0 && (
              <details className="group mt-2">
                <summary className="cursor-pointer list-none py-1 text-xs text-muted hover:text-text"><span className="inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span> Or branch off</summary>
                <div className="mt-1 grid gap-1.5">
                  {data.branches.map((b) => (
                    <button key={b.title} disabled={branching !== null} onClick={() => { setBranching(b.title); onBranch?.(b.title); }} className="rounded-md border border-line px-3 py-2 text-left hover:border-dim disabled:opacity-60">
                      <span className="block text-sm">{branching === b.title ? "Growing that path on your map…" : b.title}</span>
                      <span className="block text-xs text-muted">{b.why}</span>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
        )
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary flex-1" onClick={() => void finish()} disabled={saving || (data.interaction ? picked === null : false) || (data.challenge ? !solved : false)}>{saving ? "Saving…" : "That landed ✓"}</button>
          <button className="btn" onClick={skip} title="Teach this a different way">Teach it differently</button>
        </div>
      )}
    </section>
  );
}
