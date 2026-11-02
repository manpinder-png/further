"use client";
// F1: voice-first curiosity capture. Text is the fallback, never a second-class path.
import { useEffect, useRef, useState } from "react";
import { transcribeBlob, useExpand, useRecorder } from "@/lib/client/hooks";
import { usePath, useStore } from "@/lib/client/store";
import { useAIStream } from "@/lib/client/useAIStream";
import ActivityPanel, { OperationStatus } from "@/components/activity/ActivityPanel";
import AgentAssistant from "@/components/mission/AgentAssistant";

const EXAMPLES = ["why does training AI need special chips?", "how do chatbots remember things?", "what makes a model smaller?"];

export default function CommandBar() {
  const { say, dispatch } = useStore();
  // Return hook (Connor): pick up where you left off. Same source as "Your path".
  const next = usePath()[0];
  const { run, busy, error: expandError, activity, cancel, retry } = useExpand();
  const voice = useAIStream();
  const lastAudio = useRef<Blob | null>(null);
  const rec = useRecorder(15_000);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [lens, setLens] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const submit = async (t: string) => {
    const v = t.trim();
    if (busy) return;
    if (v.length < 2) return setErr("Say a bit more. Even a vague question works.");
    setErr(null);
    setText(v);
    if (await run(v, "text")) setText("");
  };

  const processVoice = async (blob: Blob) => {
    lastAudio.current = blob; rec.setState("processing"); setErr(null);
    try {
      say("TRANSCRIBE", `clip ${(blob.size / 1024).toFixed(0)}KB ${blob.type} → Muse Voice Transcribe`);
      const t = await transcribeBlob(blob, "curiosity", (path, init) => voice.run(path, init));
      say("TRANSCRIBE", `${t.ms}ms (target < 3000ms): "${t.text}"`, "ok", t.demo);
      if (!t.text.trim()) throw new Error("Didn't catch that. Try again or type it.");
      setText(t.text);
      if (await run(t.text, "voice")) setText("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      rec.setState("idle");
    }
  };
  const mic = async () => {
    setErr(null);
    if (rec.state === "recording") return rec.stop();
    const blob = await rec.start();
    if (!blob) return setErr("Mic blocked. Type your question instead.");
    await processVoice(blob);
  };

  const recording = rec.state === "recording";
  return (
    <>
      <div className="border-t border-line bg-panel px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5">
        <div className="mx-auto mb-2 max-h-[42dvh] max-w-4xl space-y-2 overflow-y-auto">
          <ActivityPanel activity={voice.activity} title="Voice transcription" onCancel={voice.cancel} onRetry={() => { if (lastAudio.current) void processVoice(lastAudio.current); }} compact />
          <ActivityPanel activity={activity} title="Growing your knowledge map" onCancel={cancel} onRetry={retry} compact />
          {busy && activity.status === "completed" && <OperationStatus label="Refreshing your saved map" detail="The validated result arrived. Loading its saved concepts and connections." />}
        </div>
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <button
            onClick={mic}
            disabled={rec.state === "processing" || busy}
            aria-label={recording ? "Stop recording" : "Ask by voice"}
            title={recording ? "Stop recording" : "Ask by voice"}
            className={`relative flex h-12 w-12 shrink-0 items-center justify-center border transition-colors ${recording ? "border-accent bg-accent text-bg" : "border-accent bg-accent text-bg hover:bg-accent-hover"}`}
          >
            {recording && <span className="absolute inset-0 animate-ping border border-accent" />}
            {rec.state === "processing" ? <span className="cursor-blink text-xs">…</span> : recording ? <span className="h-3.5 w-3.5 bg-bg" /> : <MicIcon />}
          </button>
          <form className="relative flex h-12 min-w-0 flex-1 items-center border border-line-2 bg-bg focus-within:border-dim" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
            <span className="pl-3 text-dim" aria-hidden>›</span>
            {recording ? (
              <div className="flex h-full flex-1 items-center gap-[3px] px-3" aria-live="polite">
                <span className="mr-2 text-xs text-text">Listening {(rec.elapsed / 1000).toFixed(1)}s</span>
                {rec.level.map((l, i) => <span key={i} className="w-[3px] bg-text/70 transition-[height]" style={{ height: `${Math.max(6, l * 80)}%` }} />)}
              </div>
            ) : (
              <input
                ref={input}
                value={text}
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
                placeholder={busy ? "Growing your map…" : "What are you curious about?  (press / )"}
                maxLength={500}
                className="h-full min-w-0 flex-1 bg-transparent px-2 text-md outline-none placeholder:text-dim"
                aria-label="What are you curious about?"
              />
            )}
            {busy && <span className="mr-3 shrink-0 text-xs text-muted" aria-live="polite">Adding…</span>}
            {!recording && <button className="mr-1.5 hidden h-9 px-3 text-xs text-muted hover:text-text sm:block" disabled={busy} aria-label="Send">Enter ↵</button>}
          </form>
          <button className="btn h-12 shrink-0 px-3" onClick={() => setLens(true)} title="Ask about a photo" aria-label="Ask about a photo" disabled={busy}>
            <LensIcon /><span className="hidden sm:inline" aria-hidden>Photo</span>
          </button>
          <button className="btn h-12 shrink-0 px-3" onClick={() => setAssistant(true)} title="Open your learning guide" aria-label="Open your learning guide"><span aria-hidden>✧</span><span className="hidden sm:inline">Guide</span></button>
        </div>
        <div className="mx-auto mt-2 flex max-w-4xl items-center gap-2 overflow-x-auto text-xs">
          {err || expandError ? <span className="text-err" role="alert">{err ?? expandError}</span> : (
            <>
              {next && (
                <button onClick={() => dispatch({ t: "select", slug: next.slug })} className="touch-target shrink-0 rounded-full border border-[#1b4a4d] px-2.5 py-1 text-mastery hover:bg-mastery-soft" title={next.reason}>
                  Continue: {next.title}
                </button>
              )}
              <span className="shrink-0 text-dim">Try</span>
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => submit(e)} disabled={busy} className="touch-target shrink-0 border border-line px-2 py-1 text-muted hover:border-dim hover:text-text">{e}</button>
              ))}
            </>
          )}
        </div>
      </div>
      {lens && <LensModal onClose={() => setLens(false)} onExplore={(question) => { setLens(false); setText(question); void run(question, "lens").then((saved) => { if (saved) setText(""); }); }} />}
      {assistant && <AgentAssistant onClose={() => setAssistant(false)} />}
    </>
  );
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
