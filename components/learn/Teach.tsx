"use client";
// One teaching moment, in whatever format Muse chose for this learner.
// Finishing (watch +0.2 mastery) or skipping (−0.3 interest) feeds the MD
// §5.4 decay model and the format affinities Muse learns from next time.
import { useEffect, useState } from "react";
import { useStore } from "@/lib/client/store";
import { learnerModel } from "@/lib/learn";

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
const cacheKey = (slug: string, round: number) => `${slug}:v3-depth${round}`;

export default function Teach({ slug, title, onBranch, onNext }: { slug: string; title: string; onBranch?: (title: string) => void; onNext?: () => void }) {
  const { nodes, events, track, say } = useStore();
  const [round, setRound] = useState(1);
  const [data, setData] = useState<TeachData | null>(() => TEACH_CACHE.get(cacheKey(slug, 1)) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [branching, setBranching] = useState<string | null>(null);
  const [guess, setGuess] = useState<number | null>(null);
  const [wrongs, setWrongs] = useState(0);
  const [solved, setSolved] = useState(false);

  useEffect(() => {
    setPicked(null); setDone(false); setGuess(null); setWrongs(0); setSolved(false); setBranching(null);
    if (TEACH_CACHE.has(cacheKey(slug, round)) && attempt === 0) { setData(TEACH_CACHE.get(cacheKey(slug, round))!); return; }
    setData(null); setError(null);
    let cancelled = false;
    let timedOut = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, 120_000);
    fetch("/api/teach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, learnerSummary: learnerModel(nodes, events).summary, depth: round }),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const d = (await r.json()) as TeachData & { error?: string };
        if (!r.ok || d.error) throw new Error(d.error ?? `Teaching failed (${r.status})`);
        if (cancelled) return;
        TEACH_CACHE.set(cacheKey(slug, round), d);
        setData(d);
        say("EXPAND", `Muse chose “${d.format}” to teach ${title}`, "ok", d.demo);
      })
      .catch((e: Error) => {
        // Our own cleanup (React double-mount, slug change) aborts the first
        // request — that is not a timeout and must never surface as one.
        if (cancelled) return;
        if (e.name === "AbortError") { if (timedOut) setError("Muse took too long deciding how to teach this. Retry."); return; }
        setError(e.message);
      })
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; clearTimeout(timer); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, attempt, round]);

  if (error)
    return (
      <section className="border border-err/60 bg-panel px-4 py-4">
        <h4 className="label mb-2 !text-err">Muse couldn&apos;t teach this yet</h4>
        <p className="font-sans text-[14px] text-muted">{error}</p>
        <button className="btn mt-3 h-9 px-3" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
      </section>
    );
  if (!data)
    return (
      <section className="border border-line bg-panel px-4 py-4">
        <h4 className="label mb-2">Muse is deciding how to teach you this…</h4>
        <div className="scanbar h-3 w-10/12 bg-panel-2" />
      </section>
    );

  const finish = () => {
    setDone(true);
    track(slug, "watch", { format: data.format });
    say("SYSTEM", `finished via ${data.format} → mastery +0.2, format evidence +1`, "ok");
  };
  const skip = () => {
    // "Not my thing" is about the FORMAT, not the concept: stay on this
    // concept and make Muse teach it a different way.
    track(slug, "skip", { format: data.format });
    say("SYSTEM", `skipped ${data.format} → Muse will re-teach this concept differently`, "warn");
    TEACH_CACHE.delete(cacheKey(slug, round));
    setAttempt((a) => a + 1);
  };

  return (
    <section className="border border-signal/60 bg-panel px-4 py-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="label !text-signal">Muse chose: {data.format}</h4>
        <span className="text-[11px] text-muted">for how you learn</span>
      </div>
      <p className="mb-3 font-sans text-[13px] italic leading-relaxed text-muted">{data.adaptedNote}{data.demo && " (demo chooser)"}</p>
      <h5 className="font-sans text-[20px] font-semibold leading-snug">{data.title}</h5>
      <p className="mt-2 font-sans text-[16px] leading-relaxed text-text/90">{data.body}</p>

      {data.challenge && !done && (
        <div className="mt-5 border border-line bg-panel-2 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-signal">Your move · {data.challenge.kind.replace(/-/g, " ")}</div>
          <p className="mt-1 font-sans text-[15px] font-medium">{data.challenge.prompt}</p>
          <div className="mt-2 grid gap-2">
            {data.challenge.options.map((o, i) => {
              const right = solved && i === data.challenge!.correct;
              const wrong = guess === i && !right;
              return (
                <button key={i} type="button" disabled={solved} onClick={() => { setGuess(i); if (i === data.challenge!.correct) { setSolved(true); const score = wrongs === 0 ? 3 : wrongs === 1 ? 2 : 1; track(slug, "explain", { score, format: `challenge:${data.format}` }); say("SYSTEM", `challenge solved (${score}/3 evidence) → mastery up to +${((score / 3) * 0.5).toFixed(2)}`, "ok"); } else setWrongs((w) => w + 1); }} className={`border px-3 py-2.5 text-left font-sans text-[14px] disabled:cursor-default ${right ? "border-ok bg-ok/10 text-ok" : wrong ? "border-err/60 text-err" : "border-line hover:border-signal"}`}>
                  {o}{right ? " ✓" : wrong ? " — not quite, try another" : ""}
                </button>
              );
            })}
          </div>
          {solved && <p className="mt-3 font-sans text-[14px] leading-relaxed text-text/90">{data.challenge.explanation}</p>}
          {!solved && <p className="mt-2 text-[12px] text-muted">Solve this to finish — wrong guesses cost nothing.</p>}
        </div>
      )}

      {data.interaction && !done && (
        <div className="mt-4">
          <p className="font-sans text-[15px] font-medium">{data.interaction.prompt}</p>
          <div className="mt-2 grid gap-2">
            {data.interaction.options.map((o, i) => (
              <button key={i} onClick={() => setPicked(i)} className={`border px-3 py-2.5 text-left font-sans text-[14px] ${picked === i ? "border-signal bg-panel-2" : "border-line hover:border-muted"}`}>{o.label}</button>
            ))}
          </div>
          {picked !== null && <p className="mt-3 border-l-2 border-signal pl-3 font-sans text-[14px] leading-relaxed text-text/90">{data.interaction.options[picked].reveal}</p>}
        </div>
      )}

      {done ? (
        nodes[slug]?.state === "understood" ? (
          <div className="mt-4">
            <p className="font-sans text-[14px] text-ok">Understood ✓ — this block is diamond now. Keep going deeper, or choose where next:</p>
            <button className="btn mt-3 h-10 px-4" onClick={() => setRound((r) => r + 1)}>Keep exploring {title} ↓</button>
            <div className="mt-2 grid gap-2">
              {data.branches.map((b) => (
                <button key={b.title} disabled={branching !== null} onClick={() => { setBranching(b.title); onBranch?.(b.title); }} className="border border-line px-3 py-2.5 text-left hover:border-signal disabled:opacity-60">
                  <span className="block font-sans text-[15px]">{branching === b.title ? "Muse is building that path…" : <>{b.title} <span className="text-signal">→</span></>}</span>
                  <span className="block font-sans text-[13px] text-muted">{b.why}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="font-sans text-[14px]">Not locked in yet — mastery {Math.round((nodes[slug]?.mastery ?? 0) * 100)}% of the way to understood. Stay here and go deeper; next concepts unlock when this one lands.</p>
            <button className="btn btn-primary mt-3 h-11 px-5 text-[13px]" onClick={() => setRound((r) => r + 1)}>Keep exploring {title} ↓</button>
          </div>
        )
      ) : (
        <div className="mt-4 flex gap-2">
          <button className="btn btn-primary h-11 px-5 text-[13px]" onClick={finish} disabled={(data.interaction ? picked === null : false) || (data.challenge ? !solved : false)}>That landed ✓</button>
          <button className="btn h-11 px-4" onClick={skip}>Not my style — teach it differently</button>
        </div>
      )}
    </section>
  );
}
