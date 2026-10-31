"use client";
// F1: voice-first curiosity capture. Text is the fallback, never a second-class path.
import { useEffect, useRef, useState } from "react";
import { transcribeBlob, useExpand, useRecorder } from "@/lib/client/hooks";
import { useStore } from "@/lib/client/store";

const EXAMPLES = ["why does training AI need special chips?", "how do chatbots remember things?", "what makes a model smaller?"];

export default function CommandBar() {
  const { say } = useStore();
  const { run, busy } = useExpand();
  const rec = useRecorder(15_000);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [lens, setLens] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const submit = (t: string) => {
    const v = t.trim();
    if (v.length < 2) return setErr("Say a bit more. Even a vague question works.");
    setErr(null);
    setText("");
    run(v, "text");
  };

  const mic = async () => {
    setErr(null);
    if (rec.state === "recording") return rec.stop();
    const blob = await rec.start();
    if (!blob) return setErr("Mic blocked. Type your question instead.");
    try {
      say("TRANSCRIBE", `clip ${(blob.size / 1024).toFixed(0)}KB ${blob.type} → Muse Voice Transcribe`);
      const t = await transcribeBlob(blob, "curiosity");
      say("TRANSCRIBE", `${t.ms}ms (target < 3000ms): "${t.text}"`, "ok", t.demo);
      if (!t.text.trim()) throw new Error("Didn't catch that. Try again or type it.");
      run(t.text, "voice");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      rec.setState("idle");
    }
  };

  const recording = rec.state === "recording";
  return (
    <>
      <div className="border-t border-line bg-panel px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <button
            onClick={mic}
            disabled={rec.state === "processing"}
            aria-label={recording ? "Stop recording" : "Speak your curiosity"}
            className={`relative flex h-12 w-12 shrink-0 items-center justify-center border transition-colors ${recording ? "border-signal bg-signal text-bg" : "border-signal/60 bg-signal-dim text-signal hover:bg-signal hover:text-bg"}`}
          >
            {recording && <span className="absolute inset-0 animate-ping border border-signal" />}
            {rec.state === "processing" ? <span className="cursor-blink text-[11px]">…</span> : recording ? <span className="h-3.5 w-3.5 bg-bg" /> : <MicIcon />}
          </button>
          <form className="relative flex h-12 min-w-0 flex-1 items-center border border-line-2 bg-bg focus-within:border-signal" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
            <span className="pl-3 text-signal">›</span>
            {recording ? (
              <div className="flex h-full flex-1 items-center gap-[3px] px-3" aria-live="polite">
                <span className="mr-2 text-[10.5px] tracking-[0.14em] text-signal">LISTENING {(rec.elapsed / 1000).toFixed(1)}s</span>
                {rec.level.map((l, i) => <span key={i} className="w-[3px] bg-signal transition-[height]" style={{ height: `${Math.max(6, l * 80)}%` }} />)}
              </div>
            ) : (
              <input
                ref={input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={busy ? "Growing your map…" : "What are you curious about?  (press / )"}
                maxLength={500}
                className="h-full min-w-0 flex-1 bg-transparent px-2 font-sans text-[15px] outline-none placeholder:text-dim"
                aria-label="Curiosity"
              />
            )}
            {busy && <span className="mr-3 text-[10px] tracking-[0.14em] text-signal">● EXPANDING</span>}
            {!recording && <button className="mr-1.5 hidden h-9 px-3 text-[11px] tracking-[0.12em] text-muted hover:text-text sm:block" disabled={busy}>ENTER ↵</button>}
          </form>
          <button className="btn hidden h-12 sm:flex" onClick={() => setLens(true)} title="Curiosity Lens (stretch): point your camera at something, SAM 3.1 segments it, tap to add">
            <LensIcon /> Lens
          </button>
        </div>
        <div className="mx-auto mt-2 flex max-w-4xl items-center gap-2 overflow-x-auto text-[11px]">
          {err ? <span className="text-err">{err}</span> : (
            <>
              <span className="shrink-0 text-dim">TRY</span>
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => submit(e)} disabled={busy} className="shrink-0 border border-line px-2 py-0.5 font-sans text-muted hover:border-muted hover:text-text">{e}</button>
              ))}
            </>
          )}
        </div>
      </div>
      {lens && <LensModal onClose={() => setLens(false)} />}
    </>
  );
}

/** Curiosity Lens: stretch goal (plan §2). Camera preview is real; SAM 3.1 segmentation is not built. */
function LensModal({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" } }).then((s) => { stream = s; if (video.current) video.current.srcObject = s; }).catch(() => setDenied(true));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal aria-label="Curiosity Lens" onClick={onClose}>
      <div className="enter w-full max-w-md border border-line bg-panel" onClick={(e) => e.stopPropagation()}>
        <header className="flex h-9 items-center justify-between border-b border-line px-3">
          <h2 className="label">Curiosity lens</h2>
          <span className="chip chip-demo">Stretch · SAM 3.1</span>
        </header>
        <div className="relative aspect-[4/3] bg-black">
          {denied ? <p className="p-6 text-[12px] text-muted">Camera unavailable.</p> : <video ref={video} autoPlay playsInline muted className="h-full w-full object-cover" />}
          <div className="pointer-events-none absolute inset-6 border border-dashed border-signal/60" />
        </div>
        <div className="space-y-2 p-3 font-sans text-[13px] text-muted">
          <p>Point at a circuit board. SAM 3.1 segments it, you tap the chip, and it becomes a node.</p>
          <p className="font-mono text-[10.5px] text-dim">HOOK: POST /api/lens {"{ image }"} → SAM 3.1 masks → Muse Spark labels → /api/expand. Owner: Amit (only after Monday freeze).</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-line p-3">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-primary" disabled title="Not built yet (stretch)">Segment</button>
        </div>
      </div>
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
