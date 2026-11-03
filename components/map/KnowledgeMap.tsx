"use client";
// The knowledge map: a radial flowchart around your question or profile (DESIGN D34–D37).
// - Rings are state: explained (inner, glowing) → explored → on your map (outer, in fog).
// - Arrows: prerequisite. Solid: part of. Dotted: related. Paths you've mastered glow and flow.
// - Living: when the graph changes, cards glide to their new place. Explanation evidence
//   and recent activity shape the view. Suggested topics appear as ghost cards.
// - Cards are real buttons: Tab, arrow keys between topics, Enter opens, Esc closes (page).
// - Pan by dragging the background, zoom with the wheel, pinch or the +/− buttons.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Concept, Edge, EdgeKind, Explorer, UserNode } from "@/lib/types";
import type { Suggestion } from "@/lib/insight";
import { SX, SY, YOU, aggregateTopicEdges, cardWidth, exitPoint, layoutRadial, layoutSummary, type LNode, type LState, type Placed } from "@/lib/graph-layout";
import type { KnowledgeTopicGroup } from "@/lib/knowledge-overview";
import { liveInterest } from "@/lib/math";
import { STATE_LABEL, relTime } from "@/lib/client/format";
import { Head, NodeIcon, useReducedMotion } from "@/components/ui/bits";

export interface KnowledgeMapProps {
  concepts: Concept[];
  edges: Edge[];
  nodes: Record<string, UserNode>;
  suggestions: Suggestion[];
  explorers: Explorer[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
  now: number;
  /** Increment to re-fit the camera. */
  fitKey?: number;
  /** Hold the camera still (time-lapse), so growth happens in a fixed frame. */
  holdCamera?: boolean;
  /** Show unlock bursts and pop-ins (off during replay). */
  celebrate?: boolean;
  you: { name: string; level: number; frac: number };
  /** A saved question scopes the view; the full title remains available in its tooltip. */
  focus?: { title: string; topicCount: number };
  /** Semantic levels for My knowledge map only. These groups never become learner evidence. */
  overview?: { groups: KnowledgeTopicGroup[]; activeGroupId: string | null; currentGroup?: KnowledgeTopicGroup | null; showGroups?: boolean; levelKey?: string; onEnter: (id: string) => void; onExit: () => void };
  /** Space reserved for the view controls and hierarchy breadcrumb. */
  topInset?: number;
  /** Per-concept history shown under each title: when it appeared and the latest activity. */
  meta?: Record<string, { addedAt?: number; lastAt?: number; lastLabel?: string }>;
  completionCounts?: Record<string, number> | null;
}

function CompletionBadge({ count }: { count: number | undefined }) {
  if (count === undefined) return null;
  return <span className="inline-flex shrink-0 items-center gap-1 rounded border border-mastery/30 bg-mastery/10 px-1.5 py-0.5 text-[10px] leading-none text-mastery" title={`Completed by ${count} ${count === 1 ? "learner" : "learners"}: 3/3 explain-back for every concept. AI-reviewed evidence, not certified mastery.`}>
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden><path d="m2 6 2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    <span>{count.toLocaleString()}</span>
  </span>;
}

type Cam = { x: number; y: number; z: number };
const ZMIN = 0.1, ZMAX = 2.2;
const RANK: Record<LState, number> = { understood: 2, explored: 1, seeded: 0, suggested: -1 };
const q = (v: number) => Math.round(v * 20) / 20; // quantize so tiny decay doesn't re-layout

export default function KnowledgeMap(p: KnowledgeMapProps) {
  const reduced = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const activeGroup = p.overview?.currentGroup ?? p.overview?.groups.find(group => group.id === p.overview?.activeGroupId);
  const inOverview = Boolean(p.overview && (p.overview.showGroups ?? !activeGroup));
  const compactSummary = inOverview && size.w > 0 && size.w < 480;
  const semanticLevel = p.overview ? p.overview.levelKey ?? (activeGroup ? `group:${activeGroup.id}` : "overview") : null;
  const groups = useMemo(() => {
    const available = new Set(p.concepts.filter(concept => p.nodes[concept.slug]).map(concept => concept.slug));
    return (p.overview?.groups ?? []).map(group => ({ ...group, conceptSlugs: [...new Set(group.conceptSlugs)].filter(slug => available.has(slug)) })).filter(group => group.conceptSlugs.length > 0);
  }, [p.overview?.groups, p.concepts, p.nodes]);
  const scope = useMemo(() => activeGroup ? new Set(activeGroup.conceptSlugs) : null, [activeGroup]);
  const concepts = useMemo(() => inOverview ? [] : p.concepts.filter(concept => (!scope || scope.has(concept.slug)) && (concept.slug !== activeGroup?.anchorSlug || scope?.size === 1)), [inOverview, p.concepts, scope, activeGroup?.anchorSlug]);
  const edges = useMemo(() => inOverview ? [] : p.edges.filter(edge => !scope || (scope.has(edge.src) && scope.has(edge.dst))), [inOverview, p.edges, scope]);
  const suggestions = useMemo(() => p.overview ? [] : p.suggestions, [p.overview, p.suggestions]);
  const summaryLinks = useMemo(() => inOverview ? aggregateTopicEdges(groups, p.edges) : [], [inOverview, groups, p.edges]);
  const navigationOrigin = useRef<{ level: string; x: number; y: number } | null>(null);
  const previousLevel = useRef<string | null>(semanticLevel);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(p);
  latest.current = p;
  useEffect(() => () => { if (navigationTimer.current) clearTimeout(navigationTimer.current); }, []);

  /* ---------- Layout ---------- */
  const lnodes = useMemo<LNode[]>(() => {
    const out: LNode[] = [];
    for (const c of concepts) {
      const n = p.nodes[c.slug];
      if (n) out.push({ slug: c.slug, state: n.state, mastery: q(n.mastery), interest: q(liveInterest(n, p.now)), w: cardWidth(n.state, c.title) });
    }
    for (const s of suggestions) out.push({ slug: s.slug, state: "suggested", mastery: 0, interest: 0, anchor: s.anchor, w: cardWidth("suggested", s.title) });
    return out;
  }, [concepts, p.nodes, suggestions, p.now]);
  const layoutKey = p.overview ? JSON.stringify([lnodes, edges, inOverview ? groups.map(group => [group.id, group.title, group.conceptSlugs.length]) : [], compactSummary]) : JSON.stringify(lnodes) + edges.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => inOverview ? layoutSummary(groups.map(group => ({ id: `group:${group.id}`, title: group.title, conceptCount: group.conceptSlugs.length })), { compact: compactSummary }) : layoutRadial(lnodes, edges), [layoutKey]);
  const info = useMemo(() => new Map(lnodes.map((n) => [n.slug, n])), [lnodes]);

  const titles = useMemo(() => {
    const m = new Map<string, string>();
    concepts.forEach((c) => m.set(c.slug, c.title));
    suggestions.forEach((s) => m.set(s.slug, s.title));
    return m;
  }, [concepts, suggestions]);

  const allEdges = useMemo(() => {
    const list: { src: string; dst: string; kind: EdgeKind; ghost?: boolean }[] = edges.filter((e) => e.src !== e.dst && layout.pos[e.src] && layout.pos[e.dst]);
    for (const s of suggestions) if (layout.pos[s.anchor]) list.push({ src: s.anchor, dst: s.slug, kind: s.kind, ghost: true });
    return list;
  }, [edges, suggestions, layout]);

  /* ---------- Living motion: glide from current to target ---------- */
  const cur = useRef(new Map<string, { x: number; y: number }>());
  const [, setFrame] = useState(0);
  const first = useRef(true);
  const fresh = useRef(new Map<string, number>()); // slug → pop-in until
  useEffect(() => {
    const T = layout.pos;
    const parentOf = (s: string) => allEdges.find((e) => e.dst === s)?.src;
    const now = performance.now();
    const levelChanged = semanticLevel !== previousLevel.current;
    const origin = navigationOrigin.current?.level === semanticLevel ? navigationOrigin.current : levelChanged && semanticLevel ? (activeGroup ? cur.current.get(`group:${activeGroup.id}`) : undefined) ?? { x: 0, y: 0 } : null;
    previousLevel.current = semanticLevel;
    navigationOrigin.current = null;
    for (const [s, t] of Object.entries(T)) {
      if (cur.current.has(s)) continue;
      const from = !first.current && origin ? origin : !first.current && parentOf(s) ? cur.current.get(parentOf(s)!) : undefined;
      cur.current.set(s, from ? { ...from } : { x: t.x, y: t.y });
      if (!first.current && p.celebrate !== false) fresh.current.set(s, now + 900);
    }
    for (const s of [...cur.current.keys()]) if (!T[s]) cur.current.delete(s);
    if (reduced || first.current) {
      for (const [s, t] of Object.entries(T)) cur.current.set(s, { x: t.x, y: t.y });
      first.current = false;
      setFrame((f) => f + 1);
      return;
    }
    let raf = 0;
    const step = () => {
      let moving = 0;
      for (const [s, t] of Object.entries(T)) {
        const c = cur.current.get(s)!;
        const dx = t.x - c.x, dy = t.y - c.y;
        if (Math.abs(dx) + Math.abs(dy) < 0.4) { c.x = t.x; c.y = t.y; continue; }
        c.x += dx * 0.11; c.y += dy * 0.11;
        moving++;
      }
      setFrame((f) => f + 1);
      if (moving) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, reduced, semanticLevel]);

  /* ---------- Unlock moments ---------- */
  const prevState = useRef(new Map<string, LState>());
  const [bursts, setBursts] = useState<{ slug: string; text: string; id: number }[]>([]);
  useEffect(() => {
    const ups: { slug: string; text: string; id: number }[] = [];
    for (const n of lnodes) {
      const before = prevState.current.get(n.slug);
      // Only learning earns a burst (not a ghost turning into a new topic).
      if (before && before !== "suggested" && p.celebrate !== false && RANK[n.state] > RANK[before] && n.state !== "seeded" && n.state !== "suggested") {
        ups.push({ slug: n.slug, text: n.state === "understood" ? "Explained" : "Exploring", id: Math.random() });
      }
      prevState.current.set(n.slug, n.state);
    }
    if (!ups.length) return;
    setBursts((b) => [...b, ...ups]);
    const t = setTimeout(() => setBursts((b) => b.filter((x) => !ups.includes(x))), 1900);
    return () => clearTimeout(t);
  }, [lnodes, p.celebrate]);

  /* ---------- Camera ---------- */
  const [cam, setCam] = useState<Cam>({ x: 0, y: 0, z: 1 });
  const [camAnim, setCamAnim] = useState(false);
  const userMoved = useRef(0);
  const camRef = useRef(cam);
  camRef.current = cam;
  const fittedZoom = useRef(1);
  const previousViewportWidth = useRef(0);
  const semanticExitPending = useRef(false);
  const lastSemanticExit = useRef(0);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => {
      if (!wrap.current) return;
      const r = wrap.current.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback((animate = true) => {
    if (!size.w) return;
    // Include new topics on every screen so a fresh question is visible before learning.
    const phone = size.w < 640;
    const ps = Object.values(layout.pos);
    let x0 = -YOU.w / 2, x1 = YOU.w / 2, y0 = -YOU.h / 2, y1 = YOU.h / 2;
    for (const b of ps) { x0 = Math.min(x0, b.x - b.w / 2); x1 = Math.max(x1, b.x + b.w / 2); y0 = Math.min(y0, b.y - b.h / 2); y1 = Math.max(y1, b.y + b.h / 2); }
    const padX = phone ? 12 : 40, padTop = p.topInset ?? 56, padBottom = 72;
    const z = Math.max(ZMIN, Math.min(1.2, (size.w - padX * 2) / (x1 - x0), (size.h - padTop - padBottom) / (y1 - y0)));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    setCamAnim(animate && !reduced);
    setCam({ x: -cx * z, y: -cy * z + (padTop - padBottom) / 2, z });
    fittedZoom.current = z;
  }, [size.w, size.h, layout, reduced, p.topInset]);

  useEffect(() => {
    const previous = previousViewportWidth.current;
    if (!p.overview) { previousViewportWidth.current = size.w; return; }
    if (!size.w || Math.abs(previous - size.w) < 24) return;
    previousViewportWidth.current = size.w;
    // Resizing to a phone-sized canvas must not retain a recently dragged desktop
    // camera. Ordinary concept layout and question-view camera rules stay intact.
    userMoved.current = 0;
    fit(previous > 0);
  }, [size.w, p.overview, fit]);

  const count = Object.keys(layout.pos).length;
  useEffect(() => {
    if (p.holdCamera) return;
    if (userMoved.current && performance.now() - userMoved.current < 8000) return;
    fit(!first.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, size.w, size.h]);
  useEffect(() => {
    if (!p.fitKey) return;
    userMoved.current = 0;
    fit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.fitKey]);
  useEffect(() => {
    semanticExitPending.current = false;
    if (!semanticLevel) return;
    userMoved.current = 0;
    fit(!first.current);
    // A level change always refits, even if it contains the same number of nodes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanticLevel]);

  const enterGroup = (id: string) => {
    const position = cur.current.get(`group:${id}`);
    if (!position || !p.overview || navigationTimer.current) return;
    navigationOrigin.current = { level: `group:${id}`, ...position };
    if (reduced) { p.overview.onEnter(id); return; }
    // Move into the selected topic before its constituent concepts unfold.
    const z = Math.min(ZMAX, Math.max(camRef.current.z, 1.15));
    setCamAnim(true);
    setCam({ x: -position.x * z, y: -position.y * z, z });
    const sourceOverview = p.overview;
    navigationTimer.current = setTimeout(() => {
      navigationTimer.current = null;
      if (latest.current.overview && latest.current.overview.activeGroupId === sourceOverview.activeGroupId) latest.current.overview.onEnter(id);
    }, 180);
  };

  const exitGroup = useCallback(() => {
    if (!latest.current.overview?.activeGroupId || semanticExitPending.current) return;
    semanticExitPending.current = true;
    lastSemanticExit.current = performance.now();
    pinch.current = null;
    drag.current = null;
    latest.current.onSelect(null);
    latest.current.overview.onExit();
  }, []);

  const zoomAt = useCallback((f: number, sx?: number, sy?: number) => {
    // Let an exiting wheel/pinch gesture settle at the new abstraction level.
    if (latest.current.overview && lastSemanticExit.current > 0 && performance.now() - lastSemanticExit.current < 300) return;
    const c = camRef.current;
    const w = size.w, h = size.h;
    const px = (sx ?? w / 2) - w / 2, py = (sy ?? h / 2) - h / 2;
    if (latest.current.overview?.activeGroupId && f < 1 && c.z * f < fittedZoom.current * .62) {
      exitGroup();
      return;
    }
    const nz = Math.max(ZMIN, Math.min(ZMAX, c.z * f));
    const wx = (px - c.x) / c.z, wy = (py - c.y) / c.z;
    setCamAnim(sx === undefined && !reduced);
    setCam({ x: px - wx * nz, y: py - wy * nz, z: nz });
    userMoved.current = performance.now();
  }, [size.w, size.h, reduced, exitGroup]);

  // Wheel zoom (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = wrap.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Drag to pan, two fingers to pinch, tap empty space to close the card.
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-card],[data-ui]")) return;
    wrap.current!.setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 1) drag.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z };
      if (drag.current) drag.current.moved = true;
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      const r = wrap.current!.getBoundingClientRect();
      const f = (pinch.current.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.d / camRef.current.z;
      zoomAt(f, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    d.moved = true;
    setCamAnim(false);
    setCam((c) => ({ ...c, x: d.cx + dx, y: d.cy + dy }));
    userMoved.current = performance.now();
  };
  const onUp = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinch.current = null;
    if (ptrs.current.size === 0) {
      if (drag.current && !drag.current.moved) p.onSelect(null);
      drag.current = null;
    }
  };

  /* ---------- Keyboard: arrows move to the nearest topic in that direction ---------- */
  const btns = useRef(new Map<string, HTMLButtonElement>());
  const reveal = (slug: string) => {
    const c = cur.current.get(slug);
    if (!c) return;
    const sx = size.w / 2 + cam.x + c.x * cam.z, sy = size.h / 2 + cam.y + c.y * cam.z;
    if (sx < 80 || sx > size.w - 80 || sy < 60 || sy > size.h - 80) {
      setCamAnim(!reduced);
      setCam((k) => ({ ...k, x: -c.x * k.z, y: -c.y * k.z }));
      userMoved.current = performance.now();
    }
  };
  const onKey = (slug: string) => (e: React.KeyboardEvent) => {
    const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
    if (!dir) return;
    e.preventDefault();
    const a = cur.current.get(slug)!;
    let best: string | null = null, bestScore = Infinity;
    for (const [s, b] of cur.current) {
      if (s === slug) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 4) continue;
      const score = along + 2 * Math.abs(dx * dir[1] - dy * dir[0]);
      if (score < bestScore) { bestScore = score; best = s; }
    }
    if (best) { btns.current.get(best)?.focus(); reveal(best); }
  };

  /* ---------- Render ---------- */
  const P = (s: string): Placed | null => {
    const c = cur.current.get(s), t = layout.pos[s];
    return c && t ? { x: c.x, y: c.y, w: t.w, h: t.h } : null;
  };
  const peersOn = useMemo(() => {
    const m = new Map<string, Explorer[]>();
    for (const e of p.explorers) {
      const at = e.activeConcepts.find((s) => p.nodes[s]);
      if (at) m.set(at, [...(m.get(at) ?? []), e]);
    }
    return m;
  }, [p.explorers, p.nodes]);

  const flow = !reduced;
  const now = performance.now();
  const focusTitle = activeGroup?.title ?? p.focus?.title.trim();
  const topicCount = activeGroup ? `${activeGroup.conceptSlugs.length} concept${activeGroup.conceptSlugs.length === 1 ? "" : "s"}` : p.focus ? `${p.focus.topicCount} concept${p.focus.topicCount === 1 ? "" : "s"}` : null;
  const centerTitle = activeGroup ? activeGroup.title : p.focus ? (focusTitle && focusTitle.length <= 30 ? focusTitle : topicCount) : p.you.name;
  const scopedCenter = Boolean(activeGroup || p.focus);

  return (
    <div
      ref={wrap}
      className="absolute inset-0 touch-none select-none overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 45%, #121216 0%, #0a0a0b 60%)", cursor: drag.current?.moved ? "grabbing" : "grab" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${size.w / 2 + cam.x}px, ${size.h / 2 + cam.y}px) scale(${cam.z})`,
          transformOrigin: "0 0",
          transition: camAnim ? "transform .6s cubic-bezier(.2,.8,.2,1)" : "none",
        }}
        onTransitionEnd={() => setCamAnim(false)}
      >
        <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
          <defs>
            <pattern id="km-dots" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#26262c" />
            </pattern>
            <radialGradient id="km-hole">
              <stop offset="0" stopColor="#000" />
              <stop offset=".55" stopColor="#000" />
              <stop offset="1" stopColor="#fff" />
            </radialGradient>
            <radialGradient id="km-glow">
              <stop offset="0" stopColor="#4ddfe6" stopOpacity=".16" />
              <stop offset="1" stopColor="#4ddfe6" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="km-light">
              <stop offset="0" stopColor="#ffffff" stopOpacity=".05" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="km-you">
              <stop offset="0" stopColor="#f26b1d" stopOpacity=".12" />
              <stop offset="1" stopColor="#f26b1d" stopOpacity="0" />
            </radialGradient>
            <mask id="km-fog" maskUnits="userSpaceOnUse" x="-6000" y="-6000" width="12000" height="12000">
              <rect x="-6000" y="-6000" width="12000" height="12000" fill="#fff" />
              <ellipse cx="0" cy="0" rx={260} ry={200} fill="url(#km-hole)" />
              {lnodes.map((n) => {
                if (n.state !== "understood" && n.state !== "explored") return null;
                const b = P(n.slug);
                if (!b) return null;
                const r = n.state === "understood" ? 150 + 60 * n.interest : 70 + 120 * n.mastery + 50 * n.interest;
                return <ellipse key={n.slug} cx={b.x} cy={b.y} rx={r * 1.3} ry={r * 0.95} fill="url(#km-hole)" />;
              })}
            </mask>
            {(["lit", "mid", "dim"] as const).map((k) => (
              <marker key={k} id={`km-arrow-${k}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                <path d="M0 1 9 5 0 9z" fill={k === "lit" ? "#4ddfe6" : k === "mid" ? "#8a8a93" : "#5f5f68"} />
              </marker>
            ))}
          </defs>

          <rect x="-6000" y="-6000" width="12000" height="12000" fill="url(#km-dots)" />
          <ellipse cx="0" cy="0" rx="300" ry="220" fill="url(#km-you)" />

          {/* Ring guides: inner understood, middle exploring, outer on your map */}
          {layout.rings.map((r) => (
            <ellipse key={r.label} cx="0" cy="0" rx={r.r * SX} ry={r.r * SY} fill="none" stroke="#1f1f25" strokeWidth="1" strokeDasharray="2 6" />
          ))}

          {/* Light pools: what you've explored is lit, understood glows cyan */}
          {lnodes.map((n) => {
            const b = P(n.slug);
            if (!b || (n.state !== "understood" && n.state !== "explored")) return null;
            return n.state === "understood"
              ? <ellipse key={n.slug} cx={b.x} cy={b.y} rx={170} ry={110} fill="url(#km-glow)" />
              : <ellipse key={n.slug} cx={b.x} cy={b.y} rx={110 + 60 * n.interest} ry={70 + 40 * n.interest} fill="url(#km-light)" />;
          })}

          {/* Paths */}
          {allEdges.map((e) => {
            const a = P(e.src), b = P(e.dst);
            if (!a || !b) return null;
            const sa = info.get(e.src)!, sb = info.get(e.dst)!;
            const lit = Math.min(RANK[sa.state], RANK[sb.state]);
            const pa = exitPoint(a, b.x, b.y), pb = exitPoint(b, a.x, a.y, e.kind === "prerequisite" ? 7 : 5);
            // Bow the curve away from the centre so lines route around you.
            const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
            const dx = pb.x - pa.x, dy = pb.y - pa.y, len = Math.hypot(dx, dy) || 1;
            let nx = -dy / len, ny = dx / len;
            if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
            const bow = Math.min(60, len * 0.14);
            const d = `M${pa.x},${pa.y} Q${mx + nx * bow},${my + ny * bow} ${pb.x},${pb.y}`;
            const tone = lit >= 2 ? "lit" : lit === 1 ? "mid" : "dim";
            const stroke = tone === "lit" ? "#4ddfe6" : tone === "mid" ? "#8a8a93" : "#55555e";
            const width = 1.2 + 2.4 * Math.min(sa.mastery, sb.mastery);
            const dash = e.ghost ? "4 5" : e.kind === "related" ? "1.5 5" : undefined;
            return (
              <g key={`${e.src}>${e.dst}`}>
                <path d={d} fill="none" stroke={stroke} strokeOpacity={tone === "lit" ? 0.75 : 1} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" markerEnd={e.kind === "prerequisite" ? `url(#km-arrow-${tone})` : undefined} />
                {tone === "lit" && flow && <path d={d} fill="none" stroke="#e8feff" strokeOpacity=".7" strokeWidth={1.4} strokeDasharray="3 39" strokeLinecap="round" className="kflow" />}
              </g>
            );
          })}

          {/* Each summary connection is backed by one or more actual concept relationships. */}
          {summaryLinks.map(link => {
            const a = P(`group:${link.src}`), b = P(`group:${link.dst}`);
            if (!a || !b) return null;
            const start = exitPoint(a, b.x, b.y), end = exitPoint(b, a.x, a.y);
            const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
            const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy) || 1;
            let nx = -dy / length, ny = dx / length;
            if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
            const bend = Math.min(90, length * .2);
            return <g key={`${link.src}:${link.dst}`}><path d={`M${start.x},${start.y} Q${mx + nx * bend},${my + ny * bend} ${end.x},${end.y}`} fill="none" stroke="#65656f" strokeWidth="1.4" strokeDasharray="3 5" /><title>{link.count} saved concept {link.count === 1 ? "relationship" : "relationships"}</title></g>;
          })}

          {/* Fog: dark everywhere except around what you've explored */}
          {!inOverview && <rect x="-6000" y="-6000" width="12000" height="12000" fill="#08080a" fillOpacity=".8" mask="url(#km-fog)" />}
        </svg>

        {/* Current question, or you in the full-map overview. */}
        <div className="kpos" style={{ transform: `translate(${-YOU.w / 2}px, ${-YOU.h / 2}px)` }}>
          <button data-card className="kyou" onClick={() => { if (activeGroup) exitGroup(); else { userMoved.current = 0; fit(true); } }} aria-label={activeGroup ? `${activeGroup.title}. ${topicCount}${p.completionCounts?.["current-topic"] === undefined ? "" : `. Completed by ${p.completionCounts["current-topic"]} learners`}. Back one level` : `${p.focus ? `This question: ${p.focus.title}. ${topicCount}` : p.you.name}. Fit the map to your topics`} title={activeGroup ? `${activeGroup.title} · Back one level` : p.focus?.title ?? "Fit the map to your topics"}>
            <svg viewBox="0 0 116 116" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="58" cy="58" r="54" fill="none" stroke="#35353e" strokeWidth="2" />
            </svg>
            <span className="text-xs text-muted">{activeGroup ? activeGroup.anchorSlug ? "Concept" : "Topic" : p.focus ? "This question" : "You"}</span>
            <span className={`display max-w-[96px] break-words leading-tight ${scopedCenter ? "mt-1 line-clamp-2 text-sm" : "truncate text-lg"}`}>{centerTitle}</span>
            {(!p.focus || centerTitle !== topicCount) && <span className="mt-1 text-2xs text-muted">{inOverview ? `${groups.length} ${activeGroup ? "subtopics" : "topics"}` : scopedCenter ? topicCount : "All topics"}</span>}
            {activeGroup && <span className="mt-1"><CompletionBadge count={p.completionCounts?.["current-topic"]} /></span>}
          </button>
        </div>

        {/* Topic containers are a distinct abstraction, not scored concept cards. */}
        {inOverview && groups.map(group => {
          const id = `group:${group.id}`, b = P(id);
          if (!b) return null;
          const connected = summaryLinks.filter(link => link.src === group.id || link.dst === group.id).length;
          const completed = p.completionCounts?.[`topic:${group.id}`];
          return <div key={id} className="kpos" style={{ transform: `translate(${b.x - b.w / 2}px, ${b.y - b.h / 2}px)`, width: b.w, height: b.h }}><button data-card className="kcard border-line-2 bg-panel shadow-[0_6px_24px_-10px_rgba(0,0,0,.8)]" style={{ padding: "12px 14px" }} ref={element => { if (element) btns.current.set(id, element); else btns.current.delete(id); }} onClick={() => enterGroup(group.id)} onKeyDown={onKey(id)} onFocus={() => reveal(id)} aria-label={`${group.title}, ${group.conceptSlugs.length} concepts${connected ? `, connected to ${connected} other topics` : ""}${completed === undefined ? "" : `, completed by ${completed} learners`}. Expand topic`} title={group.summary}><span className="flex items-start gap-2.5"><svg className="mt-0.5 shrink-0 text-accent" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden><rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" /><rect x="12" y="2" width="6" height="6" rx="1.5" stroke="currentColor" /><rect x="7" y="12" width="6" height="6" rx="1.5" stroke="currentColor" /><path d="M5 8v2h10V8M10 10v2" stroke="currentColor" /></svg><span className="min-w-0 flex-1 line-clamp-2 text-base font-medium leading-snug">{group.title}</span><CompletionBadge count={completed} /><span className="text-muted" aria-hidden>↗</span></span><span className="mt-1 pl-[28px] text-xs text-muted">{group.conceptSlugs.length} {group.conceptSlugs.length === 1 ? "concept" : "concepts"} · {group.children?.length ? `${group.children.length} subtopics` : "Explore"}</span></button></div>;
        })}

        {/* Topics */}
        {lnodes.map((n) => {
          const b = P(n.slug);
          if (!b) return null;
          const title = titles.get(n.slug) ?? n.slug;
          const completed = p.completionCounts?.[`concept:${n.slug}`];
          const sel = p.selected === n.slug;
          const opacity = n.state === "understood" ? 1 : n.state === "suggested" ? 0.88 : 0.96;
          const sugg = n.state === "suggested" ? suggestions.find((s) => s.slug === n.slug) : undefined;
          const label = sugg ? `${title}, suggested. ${sugg.reason}` : `${title}, ${STATE_LABEL[n.state as keyof typeof STATE_LABEL]}`;
          const peers = peersOn.get(n.slug) ?? [];
          const pop = (fresh.current.get(n.slug) ?? 0) > now;
          const burst = bursts.filter((x) => x.slug === n.slug);
          const meta = p.meta?.[n.slug];
          const stateLabel = STATE_LABEL[n.state as keyof typeof STATE_LABEL];
          // Dashed "not started" cards already read as untouched, so they show only when they appeared.
          const history = n.state === "suggested" ? null : [meta?.lastAt !== undefined && meta.lastLabel ? `${meta.lastLabel} ${relTime(meta.lastAt, p.now)}` : meta?.addedAt !== undefined ? `Added ${relTime(meta.addedAt, p.now)}` : null, n.state === "seeded" ? null : stateLabel].filter(Boolean).join(" · ");
          const detail = n.state === "suggested" ? sugg?.reason : [meta?.addedAt !== undefined ? `Added ${new Date(meta.addedAt).toLocaleString()}` : null, meta?.lastAt !== undefined && meta.lastLabel ? `${meta.lastLabel} ${new Date(meta.lastAt).toLocaleString()}` : "No activity yet", stateLabel].filter(Boolean).join("\n");
          return (
            <div key={n.slug} className={`kpos ${sel ? "is-selected" : ""}`} style={{ transform: `translate(${b.x - b.w / 2}px, ${b.y - b.h / 2}px)`, width: b.w, height: b.h }}>
              <div className={`h-full ${pop ? "kpop" : ""}`}>
                <button
                  data-card
                  ref={(el) => { if (el) btns.current.set(n.slug, el); else btns.current.delete(n.slug); }}
                  className={`kcard kcard-${n.state} ${sel ? "is-selected" : ""}`}
                  style={{ opacity }}
                  onClick={() => p.onSelect(n.slug)}
                  onKeyDown={onKey(n.slug)}
                  onFocus={() => reveal(n.slug)}
                  aria-label={`${history ? `${label}. ${history}` : label}${completed === undefined ? "" : `. Completed by ${completed} learners`}`}
                  aria-current={sel ? "true" : undefined}
                  title={detail}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <NodeIcon state={n.state} mastery={n.mastery} size={n.state === "understood" ? 16 : 14} />
                    <span className={`min-w-0 flex-1 truncate ${n.state === "understood" ? "text-lg font-semibold" : n.state === "explored" ? "text-md font-medium" : "text-base"}`}>{title}</span>
                    <CompletionBadge count={completed} />
                  </span>
                  {history && <span className={`truncate pl-[22px] text-2xs ${n.state === "understood" ? "text-mastery/80" : "text-muted"}`}>{history}</span>}
                  {n.state === "suggested" && <span className="text-2xs text-dim">Suggested next</span>}
                </button>
                {peers.length > 0 && (
                  <span className="pointer-events-none absolute -right-2 -top-2 flex -space-x-1.5" aria-hidden>
                    {peers.slice(0, 2).map((e) => <span key={e.id} className="rounded-full ring-2 ring-bg"><Head color={e.color} name={e.name} size={18} /></span>)}
                  </span>
                )}
                {burst.map((x) => (
                  <span key={x.id}>
                    <span className="kburst" aria-hidden />
                    <span className="kfloat" aria-hidden>{x.text}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Zoom */}
      <div data-ui className="absolute bottom-3 right-3 flex flex-col border border-line-2 bg-panel/95 backdrop-blur" role="group" aria-label="Zoom">
        <button className="map-btn" onClick={() => zoomAt(1.25)} aria-label="Zoom in" title="Zoom in">+</button>
        <button className="map-btn border-t border-line" onClick={() => zoomAt(0.8)} aria-label="Zoom out" title="Zoom out">−</button>
        <button className="map-btn border-t border-line font-mono text-2xs" onClick={() => { userMoved.current = 0; fit(true); }} aria-label="Fit map to your topics" title="Fit map to your topics">FIT</button>
        {activeGroup && <button className="map-btn border-t border-line text-sm" onClick={exitGroup} aria-label="Back one level" title="Back one level">↑</button>}
      </div>
      <p className="sr-only" role="status">{inOverview ? `${activeGroup?.title ?? "Knowledge overview"}. ${groups.length} topics. Choose a topic to reveal its subtopics and concepts.` : activeGroup ? `${activeGroup.title}. ${lnodes.length} concepts. Zoom out or choose Back one level to return.` : "Your knowledge map."} Tab or use arrow keys to move between nodes, Enter to open one, Escape to close details.</p>
    </div>
  );
}
