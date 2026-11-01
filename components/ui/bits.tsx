"use client";
import { useEffect, useState } from "react";
import { BUILDER_VIEW } from "@/lib/builder";

/**
 * A topic's state as a small glowing glyph (DESIGN D35). The map cards and every panel share it.
 * understood: filled, glowing · explored: ring that fills with mastery · seeded: dashed ring in fog ·
 * suggested: dashed ring with a plus.
 */
export function NodeIcon({ state, mastery = 0, size = 16 }: { state: string; mastery?: number; slug?: string; size?: number }) {
  const r = 6, C = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="shrink-0" aria-hidden>
      {state === "understood" ? (
        <>
          <circle cx="8" cy="8" r="7.5" fill="var(--color-mastery)" opacity=".18" />
          <circle cx="8" cy="8" r="5.6" fill="var(--color-mastery)" />
          <path d="m5.4 8.1 1.8 1.8 3.4-3.6" fill="none" stroke="#062022" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : state === "explored" ? (
        <>
          <circle cx="8" cy="8" r={r} fill="none" stroke="#3a3a42" strokeWidth="2" />
          <circle cx="8" cy="8" r={r} fill="none" stroke="var(--color-mastery)" strokeWidth="2" strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0.08, Math.min(1, mastery / 0.7)))} transform="rotate(-90 8 8)" />
          <circle cx="8" cy="8" r="2.2" fill="var(--color-text)" />
        </>
      ) : state === "suggested" ? (
        <>
          <circle cx="8" cy="8" r={r} fill="none" stroke="#85858d" strokeWidth="1.3" strokeDasharray="2 2" />
          <path d="M8 5.5v5M5.5 8h5" stroke="#cfccc6" strokeWidth="1.3" />
        </>
      ) : (
        <circle cx="8" cy="8" r={r} fill="none" stroke="#85858d" strokeWidth="1.3" strokeDasharray="2 2" />
      )}
    </svg>
  );
}

/** A person: coloured circle with an initial. */
export function Head({ color, size = 16, name }: { color: string; size?: number; name?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[#0a0a0b]"
      style={{ width: size, height: size, background: color, fontSize: Math.max(8, size * 0.5), lineHeight: 1 }}
      aria-hidden
    >
      {name ? name.trim()[0]?.toUpperCase() : null}
    </span>
  );
}

/** Brand mark: you at the centre, three topics around you. */
export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M10 10 4 4.5M10 10l6.5-3M10 10l1 7" stroke="#4ddfe6" strokeOpacity=".55" strokeWidth="1.3" />
      <circle cx="4" cy="4.5" r="2.4" fill="#4ddfe6" />
      <circle cx="16.5" cy="7" r="2" fill="none" stroke="#a3a3ab" strokeWidth="1.2" />
      <circle cx="11" cy="17" r="1.8" fill="none" stroke="#85858d" strokeWidth="1.1" strokeDasharray="1.6 1.4" />
      <circle cx="10" cy="10" r="3.4" fill="#f26b1d" />
    </svg>
  );
}

/** Overall level as a ring (game moment). */
export function LevelRing({ level, frac, size = 44 }: { level: number; frac: number; size?: number }) {
  const r = 16, C = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" stroke="#24242a" strokeWidth="3.5" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--color-mastery)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0.02, Math.min(1, frac)))} />
      </svg>
      <span className="display tabular-nums" style={{ fontSize: size * 0.36 }}>{level}</span>
    </span>
  );
}

/** Mastery as a segmented bar (DESIGN D10). Mastery colour = cyan. */
export function XpBar({ value }: { value: number }) {
  const segs = 18;
  const lvl = Math.min(10, Math.floor(value * 10));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
        <span>Mastery</span>
        <span className="tabular-nums text-text">Level {lvl} of 10</span>
      </div>
      <div className="flex h-2 gap-px border border-black bg-black p-px" role="meter" aria-valuemin={0} aria-valuemax={10} aria-valuenow={lvl} aria-label={`Mastery: level ${lvl} of 10`}>
        {Array.from({ length: segs }, (_, i) => (
          <div key={i} className="flex-1 transition-colors duration-500" style={{ background: i / segs < value ? "var(--color-mastery)" : "var(--color-mastery-soft)" }} />
        ))}
      </div>
    </div>
  );
}

/** Interest as a row of pips that fade with decay. Neutral, so mastery stays the only colour. */
export function Pips({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
        <span>Interest</span>
        <span className="tabular-nums text-text">{pct}%</span>
      </div>
      <div className="flex gap-[3px]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Interest: ${pct}%`}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="h-2 flex-1 transition-colors duration-500" style={{ background: i < Math.round(value * 10) ? "#cfccc6" : "#2a2a30" }} />
        ))}
      </div>
    </div>
  );
}

/** Per-item sample-data badge. Builder view only; learners get one banner on the map instead. */
export function Demo({ children = "DEMO", title }: { children?: React.ReactNode; title?: string }) {
  if (!BUILDER_VIEW) return null;
  return <span className="chip chip-demo h-5 px-1.5" title={title ?? "Demo data, not a live model or real user"}>{children}</span>;
}

export function Panel({ title, right, children, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex min-h-0 flex-col border-b border-line ${className}`}>
      <header className="flex h-10 shrink-0 items-center justify-between px-4">
        <h2 className="label">{title}</h2>
        {right}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

/** Tiny shield used for "Checked for safety". */
export function ShieldIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1.5 2.5 3.5v4c0 3.2 2.3 5.8 5.5 7 3.2-1.2 5.5-3.8 5.5-7v-4L8 1.5Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="m5.5 8 1.8 1.8L10.8 6.3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Re-render on an interval so relative times ("2m ago") stay fresh. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(iv);
  }, [ms]);
  return now;
}
