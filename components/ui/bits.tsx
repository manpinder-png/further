"use client";
import { useEffect, useRef, useState } from "react";
import { blockKindFor, blockTexture, drawHead, hashStr, type BlockKind } from "@/components/map/pixels";
import { BUILDER_VIEW } from "@/lib/builder";

/** A map block rendered as an inline icon, so panels and map share one vocabulary. */
export function BlockIcon({ kind, slug = "x", size = 20 }: { kind: BlockKind; slug?: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 32, 32);
    ctx.drawImage(blockTexture(kind, 16, hashStr(slug)), 0, 0, 32, 32);
  }, [kind, slug]);
  return <canvas ref={ref} width={32} height={32} style={{ width: size, height: size, imageRendering: "pixelated" }} aria-hidden />;
}

export function NodeIcon({ state, mastery, slug, size }: { state: string; mastery: number; slug: string; size?: number }) {
  return <BlockIcon kind={blockKindFor(state, mastery)} slug={slug} size={size} />;
}

export function Head({ color, size = 16 }: { color: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!;
    ctx.clearRect(0, 0, 32, 32);
    drawHead(ctx, 0, 0, 4, color);
  }, [color]);
  return <canvas ref={ref} width={32} height={32} style={{ width: size, height: size, imageRendering: "pixelated" }} aria-hidden />;
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
