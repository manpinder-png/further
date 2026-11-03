"use client";
// The drag handle on the side panel's left edge. Pointer drag, arrow keys and
// double-click reset all resize the same width; the map gives up or takes back the space.
import { useRef, useState } from "react";

interface PanelResizerProps {
  width: number;
  min: number;
  max: number;
  defaultWidth: number;
  /** Live width while dragging. */
  onResize: (width: number) => void;
  /** Final width: persist it and refit the map. */
  onCommit: (width: number) => void;
}

const STEP = 32;

export default function PanelResizer({ width, min, max, defaultWidth, onResize, onCommit }: PanelResizerProps) {
  const drag = useRef<{ x: number; width: number; last: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (value: number) => Math.round(Math.min(max, Math.max(min, value)));

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width, last: width };
    setDragging(true);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    // The panel sits on the right, so dragging left widens it.
    const next = clamp(drag.current.width + (drag.current.x - event.clientX));
    if (next !== drag.current.last) { drag.current.last = next; onResize(next); }
  };
  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const final = drag.current.last;
    drag.current = null;
    setDragging(false);
    onCommit(final);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const next = event.key === "ArrowLeft" ? width + STEP : event.key === "ArrowRight" ? width - STEP : event.key === "Home" ? max : event.key === "End" ? min : event.key === "Enter" ? defaultWidth : null;
    if (next === null) return;
    event.preventDefault();
    const value = clamp(next);
    onResize(value); onCommit(value);
  };

  return <>
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the side panel"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`${width} pixels wide`}
      tabIndex={0}
      title="Drag to resize · double-click to reset · arrow keys when focused"
      className="group absolute inset-y-0 -left-2 z-20 hidden w-4 cursor-col-resize touch-none select-none items-center justify-center outline-none md:flex"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => { const value = clamp(defaultWidth); onResize(value); onCommit(value); }}
      onKeyDown={onKeyDown}
    >
      {/* Edge highlight: the whole border lights up on hover, focus and drag. */}
      <span className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${dragging ? "bg-accent" : "bg-transparent group-hover:bg-accent/70 group-focus-visible:bg-accent"}`} aria-hidden />
      {/* Grip: always visible so the edge reads as draggable. */}
      <span className={`relative flex h-12 w-3 flex-col items-center justify-center gap-1 rounded-full border transition-colors ${dragging ? "border-accent bg-accent/20" : "border-line-2 bg-panel group-hover:border-accent/70 group-focus-visible:border-accent"}`} aria-hidden>
        {[0, 1, 2].map(dot => <span key={dot} className={`h-1 w-1 rounded-full ${dragging ? "bg-accent" : "bg-muted group-hover:bg-accent"}`} />)}
      </span>
      <span className={`pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded border border-line-2 bg-panel px-2 py-1 text-2xs text-muted shadow-lg transition-opacity ${dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`} aria-hidden>{dragging ? `${width}px` : "Drag to resize"}</span>
    </div>
    {/* While dragging, a full-screen layer keeps the cursor and stops embedded videos from swallowing the pointer. */}
    {dragging && <div className="fixed inset-0 z-50 cursor-col-resize select-none" aria-hidden />}
  </>;
}
