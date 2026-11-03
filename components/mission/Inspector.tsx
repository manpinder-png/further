"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/client/store";
import { transcribeBlob, useExpand, useRecorder } from "@/lib/client/hooks";
import Teach from "@/components/learn/Teach";
import { CloseIcon, NodeIcon } from "@/components/ui/bits";
import { liveFetch } from "@/lib/client/live";
import { mutationKey } from "@/domains/ui/contracts";
import { useAIStream } from "@/lib/client/useAIStream";
import ActivityPanel from "@/components/activity/ActivityPanel";
import Mermaid from "@/components/ui/Mermaid";
import { STATE_LABEL, personName, plural, relTime } from "@/lib/client/format";
import { orderPath } from "@/lib/client/learning-paths";
import { COMPLETE_SCORE, SCORE_LABEL, explanationAttempts, practicePrompt } from "@/lib/review";
import type { NodeState, Resource } from "@/lib/types";

interface Card { slug: string; title: string; hook: string[]; resource: Resource | null; diagram: string | null; cached: boolean; demo: boolean }
interface LinkCheck { ok: boolean; state?: "reachable" | "unavailable" | "unchecked"; message?: string; method?: string; title?: string; thumbnail?: string }
const verified = new Map<string, Promise<LinkCheck>>();
function verify(url: string) {
  if (!verified.has(url)) verified.set(url, liveFetch("/api/resources/verify", { method: "POST", body: JSON.stringify({ url }) }).then(async (r) => r.ok ? r.json() as Promise<LinkCheck> : ({ ok: false, state: "unchecked" as const })).catch(() => ({ ok: false, state: "unchecked" as const })));
  return verified.get(url)!;
}
const ytId = (url: string) => url.match(/(?:v=|youtu\.be\/)([\w-]{11})/)?.[1];
export function StateBadge({ state }: { state: NodeState }) { return <span className={`chip ${state === "understood" ? "chip-success" : ""}`}>{STATE_LABEL[state]}</span>; }

type Tab = "learn" | "explain" | "sources";
type InspectorProps = { slug?: string | null; activeSlugs?: readonly string[]; onClose?: () => void; nextTopic?: { slug: string; title: string }; onNext?: (slug: string) => void; onPathCreated?: () => void; /** The saved question run this concept belongs to; enables Go deeper. */ pathRunId?: string; /** Open on a specific activity, e.g. Review's Explain again. */ initialTab?: Tab };
export default function Inspector(props: InspectorProps) {
  const { selected } = useStore();
  const slug = props.slug === undefined ? selected : props.slug;
  return <InspectorContent key={slug ?? "map-summary"} {...props} slug={slug} />;
}
function InspectorContent({ slug, activeSlugs, onClose, nextTopic, onNext, onPathCreated, pathRunId, initialTab }: InspectorProps) {
  const { concepts, nodes, edges, events, track, dispatch, peerNames, dataMode } = useStore();
  const selected = slug ?? null;
  const concept = selected ? concepts[selected] : null;
  const node = selected ? nodes[selected] : null;
  const hasConcept = Boolean(concept);
  const lastOpened = useRef<string | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab ?? "learn");
  const [card, setCard] = useState<Card | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { activity, run: loadCard, cancel } = useAIStream();
  const { run: expand, activity: branchActivity, cancel: cancelBranch, retry: retryBranch } = useExpand();
  useEffect(() => {
    if (!selected || !hasConcept) return;
    if (lastOpened.current !== selected) { lastOpened.current = selected; void track(selected, "open"); }
    const timer = setTimeout(() => { void track(selected, "dwell"); }, 30_000);
    return () => clearTimeout(timer);
  }, [selected, hasConcept, track]);
  useEffect(() => {
    if (tab !== "sources" || !selected || card) return;
    setCardError(null);
    const controller = new AbortController();
    loadCard<Card>(`/api/card/${encodeURIComponent(selected)}`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setCard(result); }).catch((error: Error) => { if (!controller.signal.aborted) setCardError(error.message); });
    return () => controller.abort();
  }, [tab, selected, card, attempt, loadCard]);
  const branch = async (question: string) => { if (await expand(question, "text")) onPathCreated?.(); };
  if (!concept || !node) return <MapSummary activeSlugs={activeSlugs} />;
  const close = () => { dispatch({ t: "select", slug: null }); onClose?.(); };
  // Go deeper keeps the learner inside this question: new concepts attach under this one and join the same path.
  const canDeepen = Boolean(pathRunId) && dataMode === "local";
  const deepened = edges.some(edge => edge.src === concept.slug && edge.dst !== concept.slug && (!activeSlugs || activeSlugs.includes(edge.dst)));
  const deeper = () => { void expand(`Go deeper: ${concept.title}`, "text", undefined, undefined, { focus: { slug: concept.slug, title: concept.title, siblings: activeSlugs ? [...activeSlugs] : [] }, extendsRunId: pathRunId }); };
  // The end goal, from recorded evidence: learn it, explain it, then one explanation of how and why (3 of 3) completes it.
  const attempts = explanationAttempts(concept.slug, events);
  const best = attempts.reduce((top, item) => Math.max(top, item.score), 0);
  const complete = node.state === "understood" || best >= COMPLETE_SCORE;
  const learned = attempts.length > 0 || events.some(event => event.slug === concept.slug && event.kind === "watch");
  // Next on this question's path: the next concept in suggested order that isn't complete yet.
  const order = activeSlugs ? orderPath(activeSlugs.filter(item => concepts[item]), edges) : [];
  const at = order.indexOf(concept.slug);
  const nextSlug = [...order.slice(at + 1), ...order.slice(0, Math.max(0, at))].find(item => item !== concept.slug && nodes[item]?.state !== "understood");
  const next = nextSlug ? { slug: nextSlug, title: concepts[nextSlug].title } : null;
  const steps = [{ id: "learn" as const, label: "Learn", done: learned }, { id: "explain" as const, label: "Explain", done: attempts.length > 0 }, { id: "explain" as const, label: "Complete", done: complete }];
  return <article className="flex h-full min-h-0 flex-col">
    <header className="shrink-0 border-b border-line">
      {/* One compact header row: the lesson below needs the height more than a second title bar does. */}
      <div className="flex items-start gap-3 py-2.5 pl-4 pr-1"><NodeIcon state={node.state} mastery={node.mastery} slug={concept.slug} size={28} /><div className="min-w-0 flex-1"><h2 className="text-base font-semibold leading-snug">{concept.title}</h2><div className="mt-1 flex flex-wrap items-center gap-2"><StateBadge state={node.state} />{node.learnedWith && <span className="text-xs text-muted">Discussed with {personName(node.learnedWith, peerNames)}</span>}{canDeepen && <button type="button" className="btn min-h-7 px-2 py-0.5 text-xs" onClick={deeper} disabled={branchActivity.status === "running"} title={deepened ? "Add another layer of concepts under this one" : "Add 3–5 new concepts under this one, in this question"}>{branchActivity.status === "running" ? "Adding…" : deepened ? "Explore further" : "Go deeper"}</button>}</div>{concept.hook && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted" title={concept.hook}>{concept.hook}</p>}</div><button className="btn btn-icon btn-ghost min-h-9 shrink-0 border-transparent text-muted" onClick={close} aria-label="Close concept card" title="Close (Esc)"><CloseIcon /></button></div>
      <ol className="flex items-center gap-1.5 px-4 pb-2.5 text-2xs" aria-label="Your progress on this concept">{steps.map((step, index) => <li key={step.label} className="flex items-center gap-1.5">{index > 0 && <span className={`h-px w-4 ${step.done ? "bg-mastery" : "bg-line-2"}`} aria-hidden />}<button type="button" onClick={() => setTab(step.id)} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${step.done ? "border-mastery/50 text-mastery" : "border-line-2 text-muted hover:text-text"}`} aria-label={`${step.label}: ${step.done ? "done" : "not yet"}`}><span aria-hidden>{step.done ? "✓" : index + 1}</span>{step.label}</button></li>)}<li className="ml-auto text-muted" title="Each explanation is scored: 1 names the idea, 2 explains how it works, 3 explains how and why. A 3 completes the concept and fills its ring on the map.">{complete ? <span className="text-mastery">Concept complete</span> : attempts.length ? <>Best {best} of 3 · goal 3</> : <>Goal: explain how and why</>}</li></ol>
      <div className="flex gap-4 px-4" role="tablist" aria-label="Topic activities">{([["learn", "Learn"], ["explain", "Try explaining"], ["sources", "Sources"]] as const).map(([id, label]) => <button key={id} role="tab" id={`activity-${id}`} aria-selected={tab === id} aria-controls="topic-activity" onClick={() => setTab(id)} className={`whitespace-nowrap border-b-2 pb-2 text-xs ${tab === id ? "border-accent text-text" : "border-transparent text-muted hover:text-text"}`}>{label}</button>)}</div>
    </header>
    <div className="scroll min-h-0 flex-1 py-1" id="topic-activity" role="tabpanel" aria-labelledby={`activity-${tab}`}>
      {tab === "learn" && <Teach key={concept.slug} slug={concept.slug} title={concept.title} onBranch={branch} onComplete={() => setTab("explain")} />}
      {tab === "explain" && <ExplainBack slug={concept.slug} title={concept.title} next={next} onNext={(target) => dispatch({ t: "select", slug: target })} onDeeper={canDeepen ? deeper : undefined} deeperLabel={deepened ? "Explore further" : "Go deeper"} />}
      {tab === "sources" && <><div className="px-4 py-3"><h3 className="text-lg font-medium">Go to the source</h3><p className="mt-2 text-sm text-muted">A reference to compare with the explanation and explore in more depth.</p><div className="mt-4"><ActivityPanel activity={activity} title="Finding a useful source" onCancel={cancel} onRetry={() => setAttempt((n) => n + 1)} compact /></div>{cardError && <p className="mt-3 text-sm text-err" role="alert">{cardError} Your lesson is still available.</p>}</div>{card?.resource && <Source key={card.resource.url} r={card.resource} onWatch={() => { void track(concept.slug, "watch", { source: card.resource!.url }); }} />}{card && !card.resource && <p className="px-4 py-3 text-sm text-muted">No cited source was returned. You can retry or continue the lesson.</p>}{card?.diagram && <Diagram code={card.diagram} title={concept.title} />}</>}
      <div className="px-4"><ActivityPanel activity={branchActivity} title="Growing this learning path" onCancel={cancelBranch} onRetry={() => { void retryBranch().then((saved) => { if (saved) onPathCreated?.(); }); }} compact /></div>
      {nextTopic && <div className="mx-4 mt-6 border-t border-line py-5"><button className="flex w-full items-center justify-between gap-4 rounded-xl border border-line p-4 text-left hover:border-dim" onClick={() => onNext?.(nextTopic.slug)}><span><span className="block text-xs text-muted">Next topic, when you’re ready</span><span className="mt-1 block text-sm font-medium">{nextTopic.title}</span></span><span aria-hidden>→</span></button></div>}
    </div>
  </article>;
}

function MapSummary({ activeSlugs }: { activeSlugs?: readonly string[] }) {
  const { concepts, nodes, dispatch } = useStore();
  const included = activeSlugs ? new Set(activeSlugs) : null;
  const all = Object.values(nodes).filter((node) => concepts[node.slug] && (!included || included.has(node.slug)));
  const recent = [...all].sort((a, b) => b.lastTouched - a.lastTouched).slice(0, 5);
  const explained = all.filter((node) => node.state === "understood").length;
  return <div className="flex h-full min-h-0 flex-col"><header className="flex h-10 shrink-0 items-center border-b border-line px-4"><h2 className="label">Your map</h2></header><div className="scroll min-h-0 flex-1 px-4 py-4"><h3 className="text-xl font-semibold">Room to keep exploring.</h3><p className="mt-3 text-sm leading-relaxed text-muted">Select a concept on the map to learn one idea, try explaining it or follow a source. Ask a question below to grow your map.</p>{all.length > 0 && <><div className="mt-5 grid grid-cols-2 gap-3 border-y border-line py-4"><div><span className="block text-xl tabular-nums">{all.length}</span><span className="text-xs text-muted">Saved concepts</span></div><div><span className="block text-xl tabular-nums text-mastery">{explained}</span><span className="text-xs text-muted">Explained back</span></div></div><h4 className="label mb-3 mt-5">Pick up a concept</h4><div className="space-y-1">{recent.map((node) => <button key={node.slug} className="flex w-full items-center gap-3 border border-transparent px-2 py-3 text-left hover:border-line hover:bg-panel-2" onClick={() => dispatch({ t: "select", slug: node.slug })}><NodeIcon state={node.state} mastery={node.mastery} size={22} /><span className="min-w-0 flex-1 text-sm">{concepts[node.slug].title}</span><span className="text-muted" aria-hidden>→</span></button>)}</div></>}</div></div>;
}

function Source({ r, onWatch }: { r: Resource; onWatch: () => void }) {
  const [v, setV] = useState<LinkCheck | null>(null);
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
      {v?.ok && <span className="text-success">Link opens</span>}
      {v && !v.ok && <span className={v.state === "unavailable" ? "text-warn" : "text-muted"}>{v.state === "unavailable" ? "Source link unavailable" : "Cited source · link not checked"}</span>}
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
      <button className="btn btn-ghost mt-4" onClick={watch} disabled={watched}>{watched ? "Reading noted" : "I read this source"}</button>
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

function ExplainBack({ slug, title, next, onNext, onDeeper, deeperLabel }: { slug: string; title: string; next: { slug: string; title: string } | null; onNext: (slug: string) => void; onDeeper?: () => void; deeperLabel: string }) {
  const { track, events, nodes, refreshSnapshot, dataMode } = useStore();
  const attempts = explanationAttempts(slug, events);
  const best = attempts.reduce((top, item) => Math.max(top, item.score), 0);
  const complete = nodes[slug]?.state === "understood" || best >= COMPLETE_SCORE;
  const latest = attempts.at(-1);
  // Resume on the question the last review set; a fresh concept starts with the friend question.
  const [prompt, setPrompt] = useState(() => latest?.nextPrompt ?? practicePrompt(title, latest ? latest.score : null));
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<{ transcript: string; prompt: string; score: number | null; feedback: string; nextPrompt: string; demo: boolean; runId?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);
  const rec = useRecorder(30_000);
  const feedback = useAIStream(), voice = useAIStream();
  const lastExplanation = useRef("");
  const lastAudio = useRef<Blob | null>(null);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const grade = async (transcript: string) => {
    if (grading || !transcript.trim()) return;
    setGrading(true); setError(null); lastExplanation.current = transcript;
    const current = new AbortController(); controller.current = current;
    try {
      const response = await feedback.run<{ score: number | null; feedback: string; nextPrompt?: string; demo: boolean; persisted?: boolean; runId?: string }>("/api/explain", { method: "POST", headers: { "idempotency-key": mutationKey() }, body: JSON.stringify({ slug, transcript, prompt }), signal: current.signal });
      if (current.signal.aborted) return;
      setResult({ transcript, prompt, score: response.score, feedback: response.feedback, nextPrompt: response.nextPrompt?.trim() ?? "", demo: response.demo, runId: response.runId });
      if (response.persisted) await refreshSnapshot();
      else if (dataMode === "demo" && typeof response.score === "number") await track(slug, "explain", { score: response.score, feedback: response.feedback, prompt, nextPrompt: response.nextPrompt });
    } catch (err) { setError(err instanceof Error && err.name === "AbortError" ? "Stopped checking. Your answer is still here." : err instanceof Error ? err.message : "Feedback is unavailable. Your answer is still here."); }
    finally { setGrading(false); }
  };
  const processVoice = async (blob: Blob) => {
    lastAudio.current = blob; rec.setState("processing"); setError(null);
    try { const transcript = await transcribeBlob(blob, "explain", (path, init) => voice.run(path, init)); if (!transcript.text.trim()) throw new Error("Didn't catch that. Please try again."); setTyped(transcript.text); }
    catch (err) { setError(err instanceof Error ? err.message : "The recording couldn't be transcribed."); }
    finally { rec.setState("idle"); }
  };
  const mic = async () => { if (rec.state === "recording") return rec.stop(); const blob = await rec.start(); if (!blob) { setError("Microphone access is unavailable. You can type below."); return; } await processVoice(blob); };
  const nextQuestion = result ? result.nextPrompt || practicePrompt(title, result.score) : "";
  // A new question always gets a fresh, empty answer box.
  const tryNext = (question = nextQuestion) => { setPrompt(question); setTyped(""); setResult(null); feedback.reset(); setTimeout(() => input.current?.focus(), 0); };
  const revise = () => { if (!result) return; setPrompt(result.prompt); setTyped(result.transcript); setResult(null); setTimeout(() => input.current?.focus(), 0); };
  const earlier = attempts.filter(item => !result?.runId || item.runId !== result.runId);
  const questionNumber = earlier.length + 1;
  const justCompleted = result?.score === COMPLETE_SCORE;
  const completion = <div className="mt-4 rounded-lg border border-mastery/50 bg-mastery-soft/40 p-4" role="status">
    <p className="text-sm font-semibold text-mastery">✓ Concept complete</p>
    <p className="mt-1 text-sm leading-relaxed text-text/90">You explained how {title.toLowerCase()} works and why. It&rsquo;s marked Explained on your map, and Review will remind you if it goes quiet.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {next && <button className="btn btn-primary rounded-lg" onClick={() => onNext(next.slug)}>Next: {next.title} →</button>}
      {onDeeper && <button className="btn rounded-lg" onClick={onDeeper}>{deeperLabel}</button>}
      <button className="btn btn-ghost rounded-lg text-muted" onClick={() => tryNext()}>Practise with a new example</button>
    </div>
    {!next && <p className="mt-3 text-xs text-muted">Every concept in this question is complete. Go deeper here, or ask a new question to keep growing your map.</p>}
  </div>;
  return <section className="px-4 py-3">
    <div className="flex items-baseline justify-between gap-3"><h3 className="text-lg font-medium">Put it in your own words</h3>{!complete && <span className="shrink-0 text-xs text-muted">Best so far: {attempts.length ? `${best} of 3` : "none"}</span>}</div>
    {/* The goal is stated up front so the learner knows what finishes a concept. */}
    <div className="mt-2 flex items-center gap-2 text-xs text-muted"><Bars score={complete ? COMPLETE_SCORE : best} /><span>{complete ? "Complete. Practising new examples keeps it fresh." : "Goal: explain how it works and why (3 of 3) to complete this concept."}</span></div>

    {result ? <>
      <div className="mt-4 rounded-lg border border-line bg-panel-2 p-3" aria-live="polite">
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted"><span>Question {questionNumber}</span>{typeof result.score === "number" ? <><Bars score={result.score} /><span className={result.score >= COMPLETE_SCORE ? "text-mastery" : "text-text"}>{SCORE_LABEL[result.score]}</span></> : <span>{result.demo ? "Sample feedback · not scored" : "Not scored"}</span>}</p>
        <p className="mt-2 text-xs text-dim">{result.prompt}</p>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{result.feedback}</p>
        <details className="mt-3"><summary className="cursor-pointer text-xs text-muted">Your answer</summary><p className="mt-2 whitespace-pre-wrap text-sm text-muted">{result.transcript}</p></details>
      </div>
      {justCompleted ? completion : <div className="mt-4 rounded-lg border border-accent/40 p-3">
        <p className="text-xs font-medium text-accent">Next question</p>
        <p className="mt-1.5 text-sm leading-relaxed">{nextQuestion}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2"><button className="btn btn-primary rounded-lg" onClick={() => tryNext()} autoFocus>Answer this question</button><button className="btn btn-ghost rounded-lg text-muted" onClick={revise}>Revise my last answer</button></div>
        <p className="mt-2 text-xs text-dim">{typeof result.score === "number" ? `A ${Math.min(3, result.score + 1)} means: ${SCORE_LABEL[Math.min(3, result.score + 1)].toLowerCase()}.` : "Rehearsal mode doesn't score answers."}</p>
      </div>}
    </> : <>
      {complete && attempts.length > 0 && next && <p className="mt-3 text-xs text-muted">Ready to move on? <button className="text-mastery underline underline-offset-2" onClick={() => onNext(next.slug)}>Next: {next.title}</button></p>}
      <form className="mt-4" onSubmit={(event) => { event.preventDefault(); void grade(typed.trim()); }}>
        <p className="text-xs text-muted">Question {questionNumber}</p>
        <label htmlFor="explain-input" className="mt-1 block text-sm font-medium leading-relaxed">{prompt}</label>
        <textarea ref={input} id="explain-input" value={typed} onChange={(event) => setTyped(event.target.value)} maxLength={3000} rows={4} disabled={grading || rec.state === "recording"} placeholder="The way I understand it is…" className="field mt-2 rounded-md p-3 text-sm leading-relaxed" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><button type="button" className={`btn btn-ghost ${rec.state === "recording" ? "text-accent" : "text-muted"}`} onClick={() => void mic()} disabled={rec.state === "processing" || grading}>{rec.state === "recording" ? `■ Stop · ${Math.floor(rec.elapsed / 1000)}s` : rec.state === "processing" ? "Transcribing…" : "Use your voice"}</button><button className="btn btn-primary rounded-lg" disabled={grading || rec.state !== "idle" || typed.trim().length < 5}>{grading ? "Reading your answer…" : "Get feedback"}</button></div>
        <p className="mt-2 text-xs text-muted">Voice recordings are transcribed after you stop. Review the text before submitting.</p>
      </form>
    </>}

    <div className="mt-5 space-y-3"><ActivityPanel activity={voice.activity} title="Transcribing your explanation" onCancel={voice.cancel} onRetry={() => { if (lastAudio.current) void processVoice(lastAudio.current); }} compact /><ActivityPanel activity={feedback.activity} title="Reviewing your explanation" onCancel={feedback.cancel} onRetry={() => void grade(lastExplanation.current)} compact /></div>
    {error && <p className="mt-3 text-sm text-err" role="alert">{error}</p>}

    {earlier.length > 0 && <details className="mt-5 rounded-md border border-line bg-panel-2 px-3 py-2"><summary className="cursor-pointer text-xs text-muted">{plural(earlier.length, "earlier answer")} · {earlier.length > 1 ? `first ${relTime(earlier[0].at)}, latest ${relTime(earlier[earlier.length - 1].at)}` : relTime(earlier[0].at)}</summary><ol className="mt-3 space-y-3">{earlier.map((item, index) => <li key={item.at} className="text-xs"><p className="flex flex-wrap items-center gap-2 text-muted"><Bars score={item.score} /><span>Question {index + 1} · {SCORE_LABEL[Math.max(0, Math.min(3, item.score))]} · {new Date(item.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span></p>{item.prompt && <p className="mt-1 text-dim">{item.prompt}</p>}{item.feedback && <p className="mt-1 whitespace-pre-line leading-relaxed text-text/85">{item.feedback}</p>}</li>)}</ol></details>}
    <p className="mt-4 text-xs text-dim">AI feedback is one perspective on one answer, a prompt for practice rather than a validated assessment.</p>
  </section>;
}

/** Three segments for the 0–3 rubric: names the idea · how it works · how and why. */
function Bars({ score }: { score: number }) {
  return <span className="flex gap-0.5" role="img" aria-label={`${score} of 3: ${SCORE_LABEL[Math.max(0, Math.min(3, score))]}`}>{[1, 2, 3].map(level => <span key={level} className={`h-1.5 w-3 rounded-sm ${score >= level ? "bg-mastery" : "bg-line-2"}`} />)}</span>;
}
