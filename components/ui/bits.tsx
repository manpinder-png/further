"use client";
import { useEffect, useRef } from "react";
import { blockKindFor, blockTexture, drawHead, hashStr, type BlockKind } from "@/components/map/pixels";

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

/** Mastery as a Minecraft-style XP bar (DESIGN D10). */
export function XpBar({ value, label = "MASTERY" }: { value: number; label?: string }) {
  const segs = 18;
  const lvl = Math.floor(value * 10);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] tracking-[0.14em] text-muted">
        <span>{label}</span>
        <span className="pixel text-[11px] text-[#7dff4d]">LV {lvl}</span>
      </div>
      <div className="flex h-[7px] gap-px border border-black bg-black p-px" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={value} aria-label={label}>
        {Array.from({ length: segs }, (_, i) => (
          <div key={i} className="flex-1 transition-colors duration-500" style={{ background: i / segs < value ? "#7dff4d" : "#1d2a14", boxShadow: i / segs < value ? "inset 0 1px 0 #c8ff9e" : "none" }} />
        ))}
      </div>
    </div>
  );
}

/** Interest as a row of pips that fade with decay. */
export function Pips({ value, label = "INTEREST" }: { value: number; label?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] tracking-[0.14em] text-muted">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <div className="flex gap-[3px]" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={value} aria-label={label}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="h-[7px] flex-1 transition-colors duration-500" style={{ background: i < Math.round(value * 10) ? "#f26b1d" : "#2a1a10" }} />
        ))}
      </div>
    </div>
  );
}

export function Demo({ children = "DEMO", title }: { children?: React.ReactNode; title?: string }) {
  return <span className="chip chip-demo h-4 px-1.5 text-[9px]" title={title ?? "Demo data, not a live model or real user"}>{children}</span>;
}

export function Panel({ title, right, children, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex min-h-0 flex-col border-b border-line ${className}`}>
      <header className="flex h-9 shrink-0 items-center justify-between px-3">
        <h2 className="label">{title}</h2>
        {right}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
