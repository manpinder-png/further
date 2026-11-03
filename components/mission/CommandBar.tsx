"use client";
import { useEffect, useRef, useState } from "react";
import { transcribeBlob, useExpand, useRecorder } from "@/lib/client/hooks";
import { useStore } from "@/lib/client/store";
import { useAIStream } from "@/lib/client/useAIStream";
import ActivityPanel, { OperationStatus } from "@/components/activity/ActivityPanel";
import AgentAssistant from "@/components/mission/AgentAssistant";
import IndexingStatus from "@/components/activity/IndexingStatus";

const EXAMPLES = ["Why does AI need special chips?", "How do chatbots remember things?", "What makes a model smaller?"];

/** The original map dock, with reviewed voice input and real agent progress. */
export default function CommandBar({ variant = "dock", onComplete, question, onOpenTopic }: { variant?: "dock" | "panel" | "hero" | "compact"; onComplete?: () => void; question?: string; onOpenTopic?: (slug: string) => void }) {
  const { say, dispatch, concepts } = useStore();
  const { run, busy, error: expandError, activity, cancel, retry } = useExpand();
  const voice = useAIStream();
  const lastAudio = useRef<Blob | null>(null);
  const rec = useRecorder(20_000);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [lens, setLens] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const [voiceReview, setVoiceReview] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const recording = rec.state === "recording";
  // "panel" is the slim single-row composer at the foot of the side panel; it shares the dock's compact behaviour.
  const panel = variant === "panel";
  const dock = variant === "dock" || panel;
  useEffect(() => {
    const element = input.current;
    if (!panel || !element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 112)}px`;
  }, [panel, text, voiceReview]);
  useEffect(() => {
    if (!dock) input.current?.focus();
    const focusQuestion = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !target?.closest("input, textarea, [contenteditable=true], [role=dialog]")) {
        event.preventDefault(); input.current?.focus();
      }
    };
    window.addEventListener("keydown", focusQuestion);
    return () => window.removeEventListener("keydown", focusQuestion);
  }, [dock]);
  const complete = () => { setText(""); setVoiceReview(false); onComplete?.(); };
  const submit = async (valueToSend: string, source: "text" | "voice" | "lens" = voiceReview ? "voice" : "text") => {
    const value = valueToSend.trim();
    if (busy || recording || rec.state === "processing") return;
    if (value.length < 2) return setErr("Say a bit more. Even a vague question works.");
    setErr(null); setText(value);
    if (await run(value, source)) complete();
  };
  const retryQuestion = () => { void retry().then((saved) => { if (saved) complete(); }); };
  const processVoice = async (blob: Blob) => {
    lastAudio.current = blob; rec.setState("processing"); setErr(null);
    try {
      const transcript = await transcribeBlob(blob, "curiosity", (path, init) => voice.run(path, init));
      if (!transcript.text.trim()) throw new Error("Didn't catch that. Try again or type your question.");
      setText(transcript.text); setVoiceReview(true);
      say("TRANSCRIBE", "Voice question transcribed. Review or edit it before exploring.", "ok", transcript.demo);
    } catch (error) { setErr(error instanceof Error ? error.message : "We couldn't transcribe the recording."); }
    finally { rec.setState("idle"); }
  };
  const mic = async () => {
    setErr(null);
    if (recording) return rec.stop();
    const blob = await rec.start();
    if (!blob) return setErr("Microphone access is unavailable. You can type your question instead.");
    await processVoice(blob);
  };
  const progress = <>
    <IndexingStatus />
    <ActivityPanel activity={voice.activity} title="Voice transcription" onCancel={voice.cancel} onRetry={() => { if (lastAudio.current) void processVoice(lastAudio.current); }} compact={dock} />
    <ActivityPanel activity={activity} title="Growing your knowledge map" onCancel={cancel} onRetry={retryQuestion} compact={dock} />
    {busy && activity.status === "completed" && <OperationStatus label="Refreshing your saved map" detail="The response is ready. Loading its saved concepts and connections." />}
  </>;
  const questionInput = recording ? <div className={`flex min-w-0 flex-1 items-center gap-[3px] px-3 ${dock ? "h-12" : "min-h-24"}`} role="status"><span className="mr-2 shrink-0 text-xs text-accent">Listening {(rec.elapsed / 1000).toFixed(1)}s</span>{rec.level.map((level, i) => <span key={i} className="w-[3px] bg-accent/70" style={{ height: Math.max(5, level * 40) }} />)}</div> : <textarea id="curiosity-question" ref={input} value={text} onChange={(event) => setText(event.target.value)} maxLength={500} disabled={busy || rec.state === "processing"} placeholder={busy ? "Growing your map…" : panel ? "What are you curious about?" : dock ? "What are you curious about?  ( / )" : "I'm curious about…"} title={panel ? "Press / to focus" : undefined} rows={dock ? voiceReview ? 2 : 1 : 3} className={`min-w-0 flex-1 resize-none bg-transparent outline-none placeholder:text-dim ${dock ? `max-h-28 px-2 text-sm leading-6 ${panel ? "py-2" : "py-3"}` : "w-full text-lg leading-relaxed"}`} aria-label="What are you curious about?" onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && (dock ? !event.shiftKey : event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(text); } }} />;
  return <>
    {panel ? <div className="shrink-0 border-t border-line bg-panel px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
      <div className="max-h-[36dvh] space-y-2 overflow-y-auto empty:hidden">{progress}</div>
      {voiceReview && <p className="mt-1 text-xs text-muted">Review your transcript, then press Enter to explore.</p>}
      <form className={`mt-1 flex items-end gap-0.5 rounded-xl border bg-bg p-1 focus-within:border-dim ${recording ? "border-accent/60" : "border-line-2"}`} onSubmit={(event) => { event.preventDefault(); void submit(text); }}>
        <button type="button" onClick={() => void mic()} disabled={busy || rec.state === "processing"} className={`btn btn-ghost btn-icon h-10 min-h-10 shrink-0 border-transparent ${recording ? "animate-pulse text-accent" : "text-muted hover:text-text"}`} aria-label={recording ? "Stop recording" : "Ask by voice"} title={recording ? "Stop recording" : "Ask by voice"}>{rec.state === "processing" ? <span className="cursor-blink text-xs">…</span> : recording ? <span className="h-3 w-3 bg-accent" /> : <MicIcon />}</button>
        {questionInput}
        <button type="button" className="btn btn-ghost btn-icon h-10 min-h-10 shrink-0 border-transparent text-muted hover:text-text" onClick={() => setLens(true)} aria-label="Ask about a photo" title="Ask about a photo" disabled={busy || recording}><LensIcon /></button>
        <button type="button" className="btn btn-ghost btn-icon h-10 min-h-10 shrink-0 border-transparent text-muted hover:text-text" onClick={() => setAssistant(true)} aria-label="Open your learning guide" title="Your learning guide"><span aria-hidden>✧</span></button>
        {!recording && <button className="btn btn-primary btn-icon h-10 min-h-10 shrink-0 rounded-lg" disabled={busy || rec.state === "processing" || text.trim().length < 2} aria-label={busy ? "Adding to your map" : "Explore question"} title="Explore (Enter)"><span aria-hidden>{busy ? "…" : "→"}</span></button>}
      </form>
      {(err || expandError) && <p className="mt-2 text-xs text-err" role="alert">{err ?? expandError}</p>}
      {!Object.keys(concepts).length && !busy && <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs"><span className="text-dim">Try</span>{EXAMPLES.map((example) => <button key={example} type="button" onClick={() => { setText(example); setVoiceReview(false); input.current?.focus(); }} className="border border-line px-2 py-1 text-muted hover:border-dim hover:text-text">{example}</button>)}</div>}
    </div> : dock ? <div className="shrink-0 border-t border-line bg-panel px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5">
      <div className="mx-auto mb-2 max-h-[42dvh] max-w-4xl space-y-2 overflow-y-auto">{progress}</div>
      {voiceReview && <p className="mx-auto mb-2 max-w-4xl text-xs text-muted">Review your transcript, then choose Explore.</p>}
      <div className="mx-auto flex max-w-4xl items-center gap-2">
        <button type="button" onClick={() => void mic()} disabled={busy || rec.state === "processing"} className={`relative flex h-12 w-12 shrink-0 items-center justify-center border border-accent bg-accent text-bg hover:bg-accent-hover ${recording ? "animate-pulse" : ""}`} aria-label={recording ? "Stop recording" : "Ask by voice"} title={recording ? "Stop recording" : "Ask by voice"}>{rec.state === "processing" ? <span className="cursor-blink text-xs">…</span> : recording ? <span className="h-3.5 w-3.5 bg-bg" /> : <MicIcon />}</button>
        <form className="flex min-h-12 min-w-0 flex-1 items-center border border-line-2 bg-bg focus-within:border-dim" onSubmit={(event) => { event.preventDefault(); void submit(text); }}><span className="hidden pl-3 text-dim sm:block" aria-hidden>›</span>{questionInput}{!recording && <button className="mr-1 shrink-0 px-2 py-2 text-xs text-muted hover:text-text disabled:text-dim" disabled={busy || rec.state === "processing" || text.trim().length < 2} aria-label="Explore question"><span className="hidden sm:inline">{busy ? "Adding…" : "Explore"}</span><span className="sm:hidden" aria-hidden>↵</span></button>}</form>
        <button type="button" className="btn h-12 shrink-0 px-2 sm:px-3" onClick={() => setLens(true)} aria-label="Ask about a photo" title="Ask about a photo" disabled={busy || recording}><LensIcon /><span className="hidden sm:inline">Photo</span></button>
        <button type="button" className="btn h-12 shrink-0 px-2 sm:px-3" onClick={() => setAssistant(true)} aria-label="Open your learning guide" title="Open your learning guide"><span aria-hidden>✧</span><span className="hidden sm:inline">Guide</span></button>
      </div>
      <div className="mx-auto mt-2 flex max-w-4xl items-center gap-2 overflow-x-auto text-xs">{err || expandError ? <span className="text-err" role="alert">{err ?? expandError}</span> : <><span className="shrink-0 text-dim">Try</span>{EXAMPLES.map((example) => <button key={example} type="button" onClick={() => { setText(example); setVoiceReview(false); input.current?.focus(); }} disabled={busy} className="touch-target shrink-0 border border-line px-2 py-1 text-muted hover:border-dim hover:text-text">{example}</button>)}</>}</div>
    </div> : <>
      <form className={`rounded-2xl border border-line-2 bg-panel focus-within:border-accent/60 ${variant === "compact" ? "p-3" : "p-4 sm:p-5"}`} onSubmit={(event) => { event.preventDefault(); void submit(text); }}>
        {questionInput}
        {voiceReview && <p className="mt-2 text-xs text-muted">Review your transcript before exploring.</p>}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3"><div className="flex items-center gap-1"><button type="button" onClick={() => void mic()} disabled={busy || rec.state === "processing"} className="btn btn-ghost text-muted" aria-label={recording ? "Stop recording" : "Ask by voice"}>{recording ? <span aria-hidden>■</span> : <MicIcon />}</button><button type="button" className="btn btn-ghost text-muted" onClick={() => setLens(true)} aria-label="Ask about a photo" disabled={busy || recording}><LensIcon /></button></div><button className="btn btn-primary rounded-lg" disabled={busy || rec.state !== "idle" || text.trim().length < 2}>{busy ? "Growing your map…" : "Explore question"} →</button></div>
      </form>
      {(err || expandError) && <p className="mt-3 text-sm text-err" role="alert">{err ?? expandError}</p>}<div className="mt-4 space-y-3">{progress}</div>
    </>}
    {lens && <LensModal onClose={() => setLens(false)} onExplore={(nextQuestion) => { setLens(false); setText(nextQuestion); void submit(nextQuestion, "lens"); }} />}
    {assistant && <AgentAssistant question={question} onClose={() => setAssistant(false)} onOpenTopic={(slug) => { setAssistant(false); if (onOpenTopic) onOpenTopic(slug); else dispatch({ t: "select", slug }); }} />}
  </>;
}

/** A photo is understood first; the learner confirms the question before map expansion. */
function LensModal({ onClose, onExplore }: { onClose: () => void; onExplore: (text: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [sample, setSample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const { activity, run: stream, cancel } = useAIStream();
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => controller.current?.abort(), []);
  const choose = (next?: File) => {
    setError(null); setQuestion(""); setSample(false); setFile(null);
    if (!next) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) { setError("Choose a JPEG, PNG or WebP image."); return; }
    if (next.size > 8 * 1024 * 1024) { setError("Choose an image smaller than 8 MB."); return; }
    setFile(next);
  };
  const understand = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    controller.current = new AbortController();
    try {
      const form = new FormData(); form.append("image", file);
      const result = await stream<{ text: string; demo?: boolean; provenance?: { mode?: string } }>("/api/media/understand", { method: "POST", body: form, signal: controller.current.signal });
      if (typeof result.text !== "string" || !result.text.trim()) throw new Error("No learning question was returned. You can type one instead.");
      setQuestion(result.text);
      setSample(result.demo === true || result.provenance?.mode === "fixture");
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Couldn't read this photo.");
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center sm:p-6" role="dialog" aria-modal aria-labelledby="photo-title" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <section className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line bg-panel">
        <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3"><h2 id="photo-title" className="text-lg font-semibold">What caught your eye?</h2><button className="btn btn-ghost" onClick={onClose} aria-label="Close photo question">Close</button></header>
        <div className="scroll min-h-0 space-y-3 p-4">
          <p className="text-sm text-muted">Choose a photo of something you want to understand. We&apos;ll suggest a question for you to review before it changes your map.</p>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => choose(e.target.files?.[0])} disabled={busy} className="field text-sm" aria-label="Choose a photo" />
          {preview && <div className="overflow-hidden rounded-lg border border-line bg-bg">
            {/* This preview is a browser object URL, not an optimizable remote asset. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Selected photo to understand" className="max-h-64 w-full object-contain" />
          </div>}
          {sample && <p className="text-xs text-muted">Sample image interpretation · demonstration only</p>}
          <ActivityPanel activity={activity} title="Understanding your photo" onCancel={cancel} onRetry={() => void understand()} />
          {!question && <button className="btn btn-primary w-full" disabled={!file || busy} onClick={() => void understand()}>{busy ? "Looking for a learning question…" : "Help me understand this"}</button>}
          {question && <div><label className="text-sm text-muted" htmlFor="photo-question">Does this capture your curiosity?</label><textarea id="photo-question" className="field mt-2 min-h-24" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} /><button className="btn btn-primary mt-3 w-full" onClick={() => onExplore(question.trim())} disabled={question.trim().length < 2}>Explore this question</button></div>}
          {error && <p className="text-sm text-err" role="alert">{error}</p>}
        </div>
      </section>
    </div>
  );
}

const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden shapeRendering="crispEdges">
    <rect x="6" y="1" width="4" height="8" /><rect x="3" y="6" width="1" height="3" /><rect x="12" y="6" width="1" height="3" />
    <rect x="4" y="9" width="1" height="1" /><rect x="11" y="9" width="1" height="1" /><rect x="5" y="10" width="6" height="1" />
    <rect x="7" y="11" width="2" height="3" /><rect x="5" y="14" width="6" height="1" />
  </svg>
);
const LensIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden shapeRendering="crispEdges">
    <rect x="1" y="4" width="14" height="10" fillOpacity=".25" /><rect x="5" y="2" width="6" height="2" /><rect x="6" y="6" width="4" height="1" /><rect x="5" y="7" width="1" height="4" /><rect x="10" y="7" width="1" height="4" /><rect x="6" y="11" width="4" height="1" />
  </svg>
);
