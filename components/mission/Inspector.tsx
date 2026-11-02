"use client";
// Inspector: the concept card (plan §5.3, E3). One short, real, cited source, checked live;
// diagrams marked as a sketch; explain-back opt-in. Order: title → hook → source → explain → diagram.
import { useEffect, useRef, useState } from "react";
import { usePath, useStore, useSuggestions } from "@/lib/client/store";
import { transcribeBlob, useExpand, useRecorder } from "@/lib/client/hooks";
import Teach from "@/components/learn/Teach";
import { liveInterest } from "@/lib/math";
import { CloseIcon, NodeIcon, Pips, XpBar } from "@/components/ui/bits";
import { liveFetch, localJson } from "@/lib/client/live";
import { mutationKey } from "@/domains/ui/contracts";
import { useAIStream } from "@/lib/client/useAIStream";
import ActivityPanel, { OperationStatus } from "@/components/activity/ActivityPanel";
import Mermaid from "@/components/ui/Mermaid";
import { STATE_LABEL, personName } from "@/lib/client/format";
import { CATALOG } from "@/lib/demo/seed";
import type { NodeState, Resource } from "@/lib/types";
import type { Suggestion } from "@/lib/insight";

interface Card {
  slug: string;
  title: string;
  hook: string[];
  resource: Resource | null;
  diagram: string | null;
  cached: boolean;
  demo: boolean;
}

const verified = new Map<string, Promise<{ ok: boolean; method?: string; title?: string; thumbnail?: string }>>();
function verify(url: string) {
  if (!verified.has(url))
    verified.set(url, liveFetch("/api/resources/verify", { method: "POST", body: JSON.stringify({ url }) }).then(async (r) => r.ok ? r.json() : ({ ok: false, method: "network" })).catch(() => ({ ok: false, method: "network" })));
  return verified.get(url)!;
}
const ytId = (u: string) => u.match(/(?:v=|youtu\.be\/)([\w-]{11})/)?.[1];

export function StateBadge({ state }: { state: NodeState }) {
  return <span className={`chip ${state === "understood" ? "chip-success" : ""}`}>{STATE_LABEL[state]}</span>;
}

export default function Inspector({ onClose }: { onClose?: () => void }) {
  const { selected, concepts, nodes, track, say, dispatch, missions } = useStore();
  const suggestions = useSuggestions();
  const [card, setCard] = useState<Card | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardAttempt, setCardAttempt] = useState(0);
  const { activity: cardActivity, run: loadCard, cancel: cancelCard } = useAIStream();
  const c = selected ? concepts[selected] : null;
  const n = selected ? nodes[selected] : null;
  const onMap = !!c;
  const lastOpened = useRef<string | null>(null);

  // open (+0.3 interest) on select, dwell (+0.2) after 30s (plan §5.4). Suggestions aren't on the map yet.
  useEffect(() => {
    if (!selected || !onMap) { lastOpened.current = null; return; }
    if (lastOpened.current !== selected) { lastOpened.current = selected; void track(selected, "open"); }
    const t = setTimeout(() => { track(selected, "dwell"); say("SYSTEM", `dwell 30s on ${selected} → interest +0.2`); }, 30_000);
    return () => clearTimeout(t);
  }, [selected, onMap, track, say]);

  useEffect(() => {
    if (!selected) return;
    setCard(null);
    setCardError(null);
    const controller = new AbortController();
    const t0 = performance.now();
    loadCard<Card>(`/api/card/${encodeURIComponent(selected)}`, { signal: controller.signal }).then((d) => {
      if (controller.signal.aborted) return;
      const ms = Math.round(performance.now() - t0);
      setCard(d);
      say("CARD", `${selected}: ${d.cached ? "cache hit" : "generated"} in ${ms}ms${d.cached ? " (target < 500ms)" : ""}`, d.cached ? "ok" : "info", d.demo);
    }).catch((error: Error) => { if (!controller.signal.aborted) setCardError(error.message); });
    return () => controller.abort();
  }, [selected, say, cardAttempt, loadCard]);

  // Branch (Connor): grow a new path from a lesson, then open its first new topic.
  const { run, activity: branchActivity, cancel: cancelBranch, retry: retryBranch } = useExpand();
  const missionsRef = useRef(missions);
  missionsRef.current = missions;
  const branch = async (t: string) => {
    if (!(await run(t, "text"))) return;
    setTimeout(() => {
      const first = missionsRef.current[0]?.slugs?.[0];
      if (first) dispatch({ t: "select", slug: first });
    }, 50);
  };

  const sugg = selected && !c ? suggestions.find((s) => s.slug === selected) : undefined;
  if (sugg) return <SuggestionCard s={sugg} />;
  if (!c || !n) return <MapSummary />;
  const interest = liveInterest(n);
  const close = () => { dispatch({ t: "select", slug: null }); onClose?.(); };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-line pl-4 pr-1">
        <h2 className="label">Concept</h2>
        <button className="btn btn-ghost btn-icon min-h-9 border-transparent text-muted hover:text-text" onClick={close} aria-label="Close concept card" title="Close (Esc)">
          <CloseIcon />
        </button>
      </header>
      <div className="scroll min-h-0 flex-1">
        {/* 1. Title + state */}
        <div className="border-b border-line px-4 py-3">
          <div className="flex items-center gap-3">
            <NodeIcon state={n.state} mastery={n.mastery} slug={c.slug} size={40} />
            <div className="min-w-0">
              <h3 className="text-xl font-semibold">{c.title}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StateBadge state={n.state} />
                {n.learnedWith && <span className="text-xs text-muted">Learned with {personName(n.learnedWith)}</span>}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Pips value={interest} />
            <XpBar value={n.mastery} />
          </div>
        </div>

        {/* 2. Hook */}
        <section className="border-b border-line px-4 py-3" aria-label="Summary">
          <ActivityPanel activity={cardActivity} title="Understanding this concept" onCancel={cancelCard} onRetry={() => setCardAttempt((n) => n + 1)} compact />
          {cardError ? <p className="mt-2 text-sm text-err" role="alert">{cardError}</p> : card ? (
            <p className="text-base text-text/90">
              {card.hook.map((s, i) => (
                <span key={i}>
                  {s}
                  {card.resource && i < 2 && <a href="#source" className="ml-0.5 align-super text-2xs text-muted underline-offset-2 hover:underline" aria-label="Source 1">[1]</a>}{" "}
                </span>
              ))}
              {card.demo && <span className="mt-2 block text-xs text-muted">Sample explanation · demonstration only</span>}
            </p>
          ) : null}
          <ActivityPanel activity={branchActivity} title="Growing this learning path" onCancel={cancelBranch} onRetry={retryBranch} compact />
        </section>

        {/* 3. Learn: a lesson written for how you learn; branches grow new paths on the map */}
        <Teach key={c.slug} slug={c.slug} title={c.title} onBranch={branch} />

        {/* 4. Source: go deeper */}
        {card?.resource && <Source key={card.resource.url} r={card.resource} onWatch={() => { track(c.slug, "watch"); say("SYSTEM", `learner marked source complete on ${c.slug}`, "ok"); }} />}

        {/* 5. Explain it back */}
        <ExplainBack slug={c.slug} title={c.title} />

        {/* 6. Diagram (collapsed) */}
        {card?.diagram && <Diagram code={card.diagram} title={c.title} />}

        <div className="px-4 py-3">
          <button className="btn btn-ghost w-full" onClick={() => { track(c.slug, "skip"); say("SYSTEM", `skip ${c.slug} → interest −0.3, fog creeps back`, "warn"); close(); }}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

function Source({ r, onWatch }: { r: Resource; onWatch: () => void }) {
  const [v, setV] = useState<{ ok: boolean; method?: string; title?: string; thumbnail?: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [watched, setWatched] = useState(false);
  const { say } = useStore();
  useEffect(() => {
    setV(null);
    setPlaying(false);
    setWatched(false);
    let active = true;
    verify(r.url).then((d) => {
      if (!active) return;
      setV(d);
      say(d.method === "oembed" ? "OEMBED" : "GROUND", `${r.provider} source ${d.ok ? "link reachable" : "link could not be verified"} (${d.method ?? "?"})`, d.ok ? "ok" : "err", r.demo);
    });
    return () => { active = false; };
  }, [r.url, r.provider, r.demo, say]);
  const id = ytId(r.url);
  const watch = () => {
    if (!watched) { setWatched(true); onWatch(); }
  };
  const start = r.startSeconds ? `${Math.floor(r.startSeconds / 60)}:${String(r.startSeconds % 60).padStart(2, "0")}` : null;
  const meta = (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
      <span>{r.provider} · {r.kind}</span>
      {v?.ok && <span className="text-success">✓ Link checked</span>}
      {v && !v.ok && <span className="text-err">Couldn&apos;t check this link</span>}
    </p>
  );
  return (
    <section id="source" className="border-b border-line px-4 py-3">
      <h4 className="label mb-2">Source</h4>
      {id && v?.ok !== false ? (
        playing ? (
          <>
            <iframe
              className="aspect-video w-full border border-line"
              src={`https://www.youtube-nocookie.com/embed/${id}?start=${r.startSeconds ?? 0}&autoplay=1&rel=0`}
              title={r.title}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
            <p className="mt-1.5 text-sm">{r.title}</p>
            {meta}
          </>
        ) : (
          <button className="group flex w-full items-center gap-3 text-left" onClick={() => setPlaying(true)} aria-label={`Play ${r.title}${start ? ` from ${start}` : ""}`}>
            <span className="relative block aspect-video w-28 shrink-0 overflow-hidden border border-line bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v?.thumbnail ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" className="h-full w-full object-cover opacity-85 group-hover:opacity-100" />
              <span className="absolute inset-0 flex items-center justify-center"><span className="flex h-7 w-7 items-center justify-center bg-black/75 text-xs text-white">▶</span></span>
            </span>
            <span className="min-w-0">
              <span className="line-clamp-2 block text-sm group-hover:underline">{r.title}</span>
              {meta}
              {start && <span className="block text-xs text-dim">Starts at {start}</span>}
            </span>
          </button>
        )
      ) : (
        <a href={r.url} target="_blank" rel="noopener noreferrer" className="block border border-line bg-panel-2 px-3 py-2.5 hover:border-dim">
          <span className="block text-sm">{r.title} <span className="text-muted" aria-hidden>↗</span></span>
          {meta}
        </a>
      )}
      {r.demo && <p className="mt-2 text-xs text-muted">Sample resource</p>}
      <button className="btn mt-3 w-full" onClick={watch} disabled={watched}>{watched ? "Marked complete" : "I finished this source"}</button>
    </section>
  );
}

function Diagram({ code, title }: { code: string; title: string }) {
  const [big, setBig] = useState(false);
  return (
    <details className="group border-b border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 touch-target">
        <span className="flex items-center gap-2">
          <span className="text-dim transition-transform group-open:rotate-90" aria-hidden>▸</span>
          <span className="label">Diagram</span>
        </span>
        <span className="text-xs text-dim">AI sketch · may simplify</span>
      </summary>
      <div className="px-4 pb-3">
        <button className="block w-full border border-line bg-bg p-2 text-left hover:border-dim" onClick={() => setBig(true)} aria-label={`Expand diagram for ${title}`}>
          <Mermaid code={code} />
          <span className="mt-1 block text-center text-xs text-muted">Tap to expand</span>
        </button>
      </div>
      {big && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-8" role="dialog" aria-modal aria-label={`Diagram: ${title}`} onClick={() => setBig(false)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setBig(false); } }}>
          <div className="enter flex max-h-full w-full max-w-4xl flex-col border border-line-2 bg-panel" onClick={(e) => e.stopPropagation()}>
            <header className="flex h-11 shrink-0 items-center justify-between border-b border-line pl-4 pr-1">
              <span className="text-sm font-medium">{title} <span className="ml-2 text-xs font-normal text-dim">AI sketch · may simplify</span></span>
              <button className="btn btn-ghost btn-icon border-transparent text-muted hover:text-text" onClick={() => setBig(false)} aria-label="Close diagram" title="Close (Esc)" autoFocus><CloseIcon /></button>
            </header>
            <div className="scroll min-h-0 flex-1 p-4"><Mermaid code={code} large /></div>
          </div>
        </div>
      )}
    </details>
  );
}

function ExplainBack({ slug, title }: { slug: string; title: string }) {
  const { track, say, refreshSnapshot, dataMode } = useStore();
  const rec = useRecorder(20_000);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<{ transcript: string; score: number | null; feedback: string; demo: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);
  const feedbackStream = useAIStream();
  const voiceStream = useAIStream();
  const lastExplanation = useRef("");
  const lastAudio = useRef<Blob | null>(null);
  const gradingController = useRef<AbortController | null>(null);
  const activeSlug = useRef(slug); activeSlug.current = slug;
  useEffect(() => {
    setResult(null); setOpen(false); setErr(null); setTyped(""); setGrading(false);
    return () => gradingController.current?.abort();
  }, [slug]);

  const grade = async (transcript: string, demo: boolean) => {
    if (grading || activeSlug.current !== slug) return;
    setGrading(true); setErr(null);
    lastExplanation.current = transcript;
    const controller = new AbortController(); gradingController.current = controller;
    try {
    say("GRADE", `rubric 0–3 on "${transcript.slice(0, 40)}…"`, "info", demo);
    const d = await feedbackStream.run<{ score: number | null; feedback: string; demo: boolean; persisted?: boolean }>("/api/explain", { method: "POST", headers: { "idempotency-key": mutationKey() }, body: JSON.stringify({ slug, transcript }), signal: controller.signal });
    if (controller.signal.aborted || activeSlug.current !== slug) return;
    setResult({ transcript, ...d });
    if (d.persisted) await refreshSnapshot();
    else if (dataMode === "demo" && typeof d.score === "number") track(slug, "explain", { score: d.score });
    say("GRADE", typeof d.score === "number" ? `${d.score}/3 · "${d.feedback}"` : "Ungraded rehearsal feedback; no mastery credit", "ok", d.demo);
    } finally { if (gradingController.current === controller) setGrading(false); }
  };

  const processVoice = async (blob: Blob) => {
    lastAudio.current = blob; rec.setState("processing"); setErr(null);
    try {
      say("TRANSCRIBE", `explain-back clip ${(blob.size / 1024).toFixed(0)}KB → Voice Transcribe`);
      const t = await transcribeBlob(blob, "explain", (path, init) => voiceStream.run(path, init));
      say("TRANSCRIBE", `${t.ms}ms: "${t.text.slice(0, 50)}…"`, "ok", t.demo);
      await grade(t.text, t.demo);
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError") && activeSlug.current === slug) setErr((e as Error).message);
    } finally {
      rec.setState("idle");
    }
  };
  const onMic = async () => {
    setErr(null);
    if (rec.state === "recording") return rec.stop();
    const blob = await rec.start();
    if (!blob) return setErr("Mic blocked. You can type instead.");
    await processVoice(blob);
  };

  return (
    <section className="border-b border-line px-4 py-3" aria-labelledby="explain-h">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 id="explain-h" className="label">Explain it back</h4>
        <span className="text-xs text-muted">Optional · never a quiz</span>
      </div>
      <ActivityPanel activity={voiceStream.activity} title="Transcribing your explanation" onCancel={voiceStream.cancel} onRetry={() => { if (lastAudio.current) void processVoice(lastAudio.current); }} compact />
      <ActivityPanel activity={feedbackStream.activity} title="Checking your explanation" onCancel={feedbackStream.cancel} onRetry={() => void grade(lastExplanation.current, dataMode === "demo").catch((e: Error) => setErr(e.message))} compact />
      {result ? (
        <div className="enter" aria-live="polite">
          <div className="mb-2 flex items-center gap-1" aria-label={typeof result.score === "number" ? `${result.score} of 3` : "Ungraded feedback"}>
            {typeof result.score === "number" ? <><span className="flex gap-1">{[0, 1, 2].map((i) => <NodeIcon key={i} state={i < result.score! ? "understood" : "seeded"} size={20} />)}</span><span className="display ml-2 text-sm">{result.score}/3</span></> : <span className="text-xs text-muted">Ungraded · no progress credit</span>}
            {result.demo && <span className="ml-auto text-xs text-muted">Sample feedback</span>}
          </div>
          <p className="text-sm text-text/90">{result.feedback}</p>
          <p className="mt-2 border-l-2 border-line-2 pl-2 text-xs italic text-muted">&ldquo;{result.transcript}&rdquo;</p>
        </div>
      ) : (
        <>
          <p className="mb-2.5 text-sm text-muted">Say what {title.toLowerCase()} is in your own words. About 20 seconds. This is how a topic becomes understood.</p>
          <div className="flex items-center gap-2">
            <button className={`btn ${rec.state === "recording" ? "btn-primary" : ""}`} onClick={onMic} disabled={rec.state === "processing" || grading}>
              {rec.state === "recording" ? `■ Stop · ${Math.floor((20000 - rec.elapsed) / 1000)}s` : rec.state === "processing" ? "Checking…" : "Explain by voice"}
            </button>
            {rec.state === "recording" && (
              <div className="flex h-6 flex-1 items-center gap-[2px]" aria-hidden>
                {rec.level.map((l, i) => <span key={i} className="w-[3px] bg-text/70" style={{ height: `${Math.max(8, l * 100)}%` }} />)}
              </div>
            )}
            {rec.state !== "recording" && rec.state !== "processing" && (
              <button className="btn btn-ghost border-transparent text-muted hover:text-text" onClick={() => setOpen(!open)} aria-expanded={open}>or type</button>
            )}
          </div>
          {open && (
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) grade(typed.trim(), dataMode === "demo").catch((x: Error) => { if (x.name !== "AbortError" && activeSlug.current === slug) setErr(x.message); }); }}>
              <input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="It's when…" maxLength={3000} aria-label={`Explain ${title} in your own words`} autoFocus />
              <button className="btn" disabled={grading || !typed.trim()}>{grading ? "Checking…" : "Send"}</button>
            </form>
          )}
          {err && <p className="mt-2 text-xs text-err" role="alert">{err}</p>}
        </>
      )}
    </section>
  );
}

/** Cold start (Connor): you don't need the right question. Presets send exactly what they say. */
const STARTS = ["Learn AI from zero", "Why AI needs special chips", "How chatbots work"];
function StartHere() {
  const { run, busy, error, activity, cancel, retry } = useExpand();
  return (
    <div className="mb-5">
      <h3 className="label mb-2">Start here</h3>
      <div className="grid gap-1.5">
        {STARTS.map((t) => (
          <button key={t} disabled={busy} onClick={() => run(t, "text")} className="rounded-md border border-line bg-panel-2 px-3 py-2.5 text-left text-sm hover:border-dim disabled:opacity-50">
            {t} <span aria-hidden>→</span>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-err" role="alert">{error}</p>}
      <ActivityPanel activity={activity} title="Growing your first learning path" onCancel={cancel} onRetry={retry} compact />
    </div>
  );
}

function MapSummary() {
  const { nodes, concepts, dispatch } = useStore();
  const next = usePath()[0];
  const list = Object.values(nodes);
  const stats = { understood: list.filter((n) => n.state === "understood").length, explored: list.filter((n) => n.state === "explored").length, seeded: list.filter((n) => n.state === "seeded").length };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-10 shrink-0 items-center border-b border-line px-4"><h2 className="label">Your map</h2></header>
      <div className="scroll min-h-0 flex-1 px-4 py-4">
        <p className="mb-4 text-base text-muted">Tap a topic on the map to open its card. Topics you learn light up and move closer to you. Ones you skip drift back into the fog.</p>
        {next ? (
          <button onClick={() => dispatch({ t: "select", slug: next.slug })} className="mb-5 block w-full rounded-md border border-[#1b4a4d] bg-mastery-soft/60 px-3 py-2.5 text-left hover:border-mastery">
            <span className="block text-2xs uppercase tracking-[0.12em] text-mastery">Pick up where you left off</span>
            <span className="mt-0.5 block text-md font-medium">{next.title} <span aria-hidden>→</span></span>
            <span className="block text-xs text-muted">{next.reason}</span>
          </button>
        ) : list.length === 0 ? <StartHere /> : null}
        <dl className="mb-5 grid grid-cols-3 overflow-hidden rounded-md border border-line">
          {(["understood", "explored", "seeded"] as const).map((s) => (
            <div key={s} className="flex flex-col items-center gap-1 border-r border-line py-3 last:border-r-0">
              <NodeIcon state={s} mastery={0.4} size={20} />
              <dd className="text-xl font-semibold tabular-nums">{stats[s]}</dd>
              <dt className="text-xs text-muted">{STATE_LABEL[s]}</dt>
            </div>
          ))}
        </dl>
        <h3 className="label mb-2">How to read the map</h3>
        <ul className="space-y-2 text-sm text-text/90">
          <li className="flex items-center gap-2"><NodeIcon state="understood" size={16} /> Understood: glows, closest to you</li>
          <li className="flex items-center gap-2"><NodeIcon state="explored" mastery={0.35} size={16} /> Explored: the ring fills as you learn</li>
          <li className="flex items-center gap-2"><NodeIcon state="seeded" size={16} /> On your map: in the fog until you open it</li>
          <li className="flex items-center gap-2"><NodeIcon state="suggested" size={16} /> Suggested next: picked from how you learn</li>
          <li className="flex items-center gap-2"><Line arrow /> Learn this first</li>
          <li className="flex items-center gap-2"><Line /> Part of</li>
          <li className="flex items-center gap-2"><Line dotted /> Related</li>
          <li className="flex items-center gap-2"><Line lit /> A path you&apos;ve mastered</li>
          <li className="text-muted">Rings: understood closest to you, then exploring, then the fog. Bigger cards = deeper understanding. Blurry cards are fading from memory.</li>
        </ul>
        <h3 className="label mb-2 mt-5">Recent</h3>
        <ul className="space-y-0.5">
          {[...list].sort((a, b) => b.lastTouched - a.lastTouched).slice(0, 10).map((n) => (
            <li key={n.slug}>
              <button data-slug={n.slug} onClick={() => dispatch({ t: "select", slug: n.slug })} className="flex min-h-9 w-full items-center gap-2 rounded px-1 text-left text-sm hover:bg-panel-2">
                <NodeIcon state={n.state} mastery={n.mastery} size={16} />
                <span className="truncate">{concepts[n.slug]?.title ?? n.slug}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">{STATE_LABEL[n.state]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Line({ arrow, dotted, lit }: { arrow?: boolean; dotted?: boolean; lit?: boolean }) {
  const c = lit ? "#4ddfe6" : "#8a8a93";
  return (
    <svg width="22" height="10" viewBox="0 0 22 10" className="shrink-0" aria-hidden>
      <path d="M1 5h17" stroke={c} strokeWidth={lit ? 2.2 : 1.6} strokeDasharray={dotted ? "1.5 3.5" : undefined} strokeLinecap="round" />
      {arrow && <path d="M15 1.5 21 5l-6 3.5z" fill={c} />}
    </svg>
  );
}

/** A suggested topic: not on the map yet. Add it, or say not now (the map stops suggesting it). */
function SuggestionCard({ s }: { s: Suggestion }) {
  const { dispatch, track, concepts, dataMode, refreshSnapshot } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anchorTitle = concepts[s.anchor]?.title ?? s.anchor;
  const close = () => dispatch({ t: "select", slug: null });
  const add = async () => {
    setBusy(true); setError(null);
    try {
    const anchor = concepts[s.anchor];
    const concept = { ...(CATALOG[s.slug] ?? {}), slug: s.slug, title: s.title, hook: s.hook, domain: anchor?.domain ?? "ai-tech" };
    if (dataMode === "local") {
      await localJson("/api/data/concepts", { method: "POST", body: JSON.stringify({ concept: { ...concept, domain: "ai-tech" }, edge: { from: s.anchor, kind: s.kind } }) });
      await refreshSnapshot();
    } else {
      dispatch({ t: "concept", c: concept, edge: { src: s.anchor, dst: s.slug, kind: s.kind } });
      await track(s.slug, "seed", { via: "suggestion" });
    }
    dispatch({ t: "note", text: `Added ${s.title} from a suggestion` });
    dispatch({ t: "select", slug: s.slug });
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't add this topic."); }
    finally { setBusy(false); }
  };
  const notNow = () => { dispatch({ t: "dismiss", slug: s.slug }); close(); };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-line pl-4 pr-1">
        <h2 className="label">Suggested next</h2>
        <button className="btn btn-ghost btn-icon min-h-9 border-transparent text-muted hover:text-text" onClick={close} aria-label="Close suggestion" title="Close (Esc)">
          <CloseIcon />
        </button>
      </header>
      <div className="scroll min-h-0 flex-1">
        <div className="border-b border-line px-4 py-3">
          <div className="flex items-center gap-3">
            <NodeIcon state="suggested" size={36} />
            <div className="min-w-0">
              <h3 className="text-xl font-semibold">{s.title}</h3>
              <p className="mt-0.5 text-xs text-muted">Grows from {anchorTitle}</p>
            </div>
          </div>
        </div>
        <section className="border-b border-line px-4 py-3">
          <h4 className="label mb-1.5">Why this</h4>
          <p className="text-base text-text/90">{s.reason}</p>
        </section>
        <section className="border-b border-line px-4 py-3" aria-label="Summary">
          <p className="text-base text-text/90">{s.hook}</p>
        </section>
        <div className="flex gap-2 px-4 py-3">
          <button className="btn btn-primary flex-1" onClick={() => void add()} disabled={busy}>{busy ? "Saving…" : "Add to my map"}</button>
          <button className="btn btn-ghost" onClick={notNow} disabled={busy} title="The map won't suggest this again">Not now</button>
        </div>
        {error && <p className="px-4 pb-3 text-sm text-err" role="alert">{error}</p>}
        {busy && <div className="px-4 pb-3"><OperationStatus label="Saving this topic" detail="Adding the concept and connection to your local map, then reloading saved state." /></div>}
      </div>
    </div>
  );
}
