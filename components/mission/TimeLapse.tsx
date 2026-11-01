"use client";
// F6 / E4: "Your brain this week". Replays the event log in ≤ 10s with a scrubber.
// Reduced motion: steps one day at a time instead of animating continuously.
import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/components/ui/bits";

export interface TL { on: boolean; t: number; playing: boolean }
export const TL_MS = 10_000;
const DAY = 86_400_000;

export default function TimeLapse({ start, end, tl, setTl, counts }: { start: number; end: number; tl: TL; setTl: (f: (p: TL) => TL) => void; counts?: string }) {
  const raf = useRef(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!tl.playing) return;
    if (reduced) {
      const iv = setInterval(() => setTl((p) => {
        const t = Math.min(end, p.t + DAY);
        return t >= end ? { ...p, t: end, playing: false } : { ...p, t };
      }), 1200);
      return () => clearInterval(iv);
    }
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
  }, [tl.playing, start, end, setTl, reduced]);

  const days = Math.max(1, Math.ceil((end - start) / DAY));
  const day = Math.min(days, Math.floor((tl.t - start) / DAY) + 1);
  const frac = (tl.t - start) / Math.max(1, end - start);

  if (!tl.on)
    return (
      <button className="btn absolute bottom-3 left-3 bg-panel/90 backdrop-blur" onClick={() => setTl(() => ({ on: true, t: start, playing: true }))}>
        <span aria-hidden>▶</span> Your brain this week
      </button>
    );

  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 text-center" aria-live="polite">
        <div className="display text-3xl text-white [text-shadow:3px_3px_0_#000]">Day {day}</div>
        <div className="mt-1.5 bg-black/60 px-2 py-0.5 text-sm text-text">{new Date(tl.t).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</div>
        {counts && <div className="mt-1 text-sm tabular-nums text-mastery">{counts}</div>}
      </div>
      <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 border border-line-2 bg-panel/95 px-3 py-2 backdrop-blur md:right-16">
        <button className="btn btn-ghost btn-icon shrink-0 border-transparent" onClick={() => setTl((p) => ({ ...p, playing: !p.playing, t: p.t >= end ? start : p.t }))} aria-label={tl.playing ? "Pause replay" : "Play replay"} title={tl.playing ? "Pause" : "Play"}>
          {tl.playing ? "❚❚" : "▶"}
        </button>
        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(frac * 1000)}
            onChange={(e) => setTl((p) => ({ ...p, playing: false, t: start + ((end - start) * Number(e.target.value)) / 1000 }))}
            className="w-full accent-[var(--color-accent)]"
            aria-label="Replay position"
            aria-valuetext={`Day ${day} of ${days}`}
          />
          <div className="mt-0.5 flex justify-between text-2xs text-dim" aria-hidden>
            {Array.from({ length: days }, (_, i) => (
              <span key={i} className={i + 1 === day ? "text-text" : ""}>
                <span className="hidden sm:inline">Day </span>{i + 1}
              </span>
            ))}
          </div>
        </div>
        <button className="btn btn-ghost shrink-0 border-transparent text-muted hover:text-text" onClick={() => setTl(() => ({ on: false, t: end, playing: false }))}>
          Exit
        </button>
      </div>
    </>
  );
}
