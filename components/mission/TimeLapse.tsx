"use client";
// F6 / E4: "Your brain this week". Replays the event log in ≤ 10s with a scrubber.
import { useEffect, useRef } from "react";

export interface TL { on: boolean; t: number; playing: boolean }
export const TL_MS = 10_000;

export default function TimeLapse({ start, end, tl, setTl }: { start: number; end: number; tl: TL; setTl: (f: (p: TL) => TL) => void }) {
  const raf = useRef(0);
  useEffect(() => {
    if (!tl.playing) return;
    let prev = performance.now();
    const step = (now: number) => {
      const dt = now - prev;
      prev = now;
      setTl((p) => {
        const t = p.t + ((end - start) * dt) / TL_MS;
        return t >= end ? { ...p, t: end, playing: false } : { ...p, t };
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [tl.playing, start, end, setTl]);

  const day = Math.min(7, Math.floor((tl.t - start) / 86_400_000) + 1);
  const frac = (tl.t - start) / Math.max(1, end - start);

  if (!tl.on)
    return (
      <button className="btn absolute bottom-3 left-3 border-line-2 bg-panel/90 backdrop-blur" onClick={() => setTl(() => ({ on: true, t: start, playing: true }))}>
        <span className="text-signal">▶</span> Your brain this week
      </button>
    );

  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 text-center">
        <div className="pixel text-[34px] leading-none text-white [text-shadow:3px_3px_0_#000]">DAY {day}</div>
        <div className="mt-1 text-[10px] tracking-[0.2em] text-muted [text-shadow:1px_1px_0_#000]">{new Date(tl.t).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }).toUpperCase()}</div>
      </div>
      <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 border border-line-2 bg-panel/95 px-3 py-2 backdrop-blur sm:right-16">
        <button className="w-6 text-signal" onClick={() => setTl((p) => ({ ...p, playing: !p.playing, t: p.t >= end ? start : p.t }))} aria-label={tl.playing ? "Pause" : "Play"}>
          {tl.playing ? "❚❚" : "▶"}
        </button>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between">
            {Array.from({ length: 8 }, (_, i) => <span key={i} className="h-2 w-px bg-line-2" />)}
          </div>
          <input type="range" min={0} max={1000} value={Math.round(frac * 1000)} onChange={(e) => setTl((p) => ({ ...p, playing: false, t: start + ((end - start) * Number(e.target.value)) / 1000 }))} className="relative w-full accent-[#f26b1d]" aria-label="Time-lapse position" />
        </div>
        <span className="w-14 text-right text-[10px] tabular-nums text-muted">{Math.round(frac * 100)}%</span>
        <button className="text-[10px] tracking-[0.12em] text-muted hover:text-text" onClick={() => setTl(() => ({ on: false, t: end, playing: false }))}>EXIT ✕</button>
      </div>
    </>
  );
}
