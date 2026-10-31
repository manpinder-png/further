"use client";
// The world: a top-down 2D tile map (DESIGN §2.2). Concepts are blocks, edges are
// paths, unexplored space is fog, other explorers are player heads.
// Rendering rules come from lib/math.ts so the time-lapse and live map agree.
// Labels: drawn last, in screen space, with collision avoidance. Shown for the selected
// block, its neighbours, understood blocks, hover/keyboard focus, fresh blocks, or when zoomed in.
// Keyboard: each block has a transparent focusable button positioned over it (Tab / arrows / Enter).
import { useEffect, useMemo, useRef } from "react";
import { STATE_LABEL } from "@/lib/client/format";
import type { Concept, Edge, Explorer, UserNode } from "@/lib/types";
import { liveInterest, opacityFor, revealFor, sizeFor } from "@/lib/math";
import { WORLD_H, WORLD_W } from "@/lib/layout";
import { TILE, bakeTerrain, blockKindFor, blockTexture, drawHead, genTerrain, hashStr, pathTexture } from "./pixels";

export interface WorldMapProps {
  concepts: Concept[];
  edges: Edge[];
  nodes: Record<string, UserNode>;
  explorers: Explorer[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
  now: number;
  /** Increment to re-fit the camera to all nodes. */
  fitKey?: number;
  /** Hold the camera still (time-lapse), so growth happens in a fixed frame. */
  holdCamera?: boolean;
}

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; size: number };
const SEED = 1729;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export default function WorldMap(props: WorldMapProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;
  const api = useRef<{ zoom: (f: number) => void; fit: () => void; reveal: (slug: string) => void }>(null);
  const btns = useRef(new Map<string, HTMLButtonElement>());
  const focusSlug = useRef<string | null>(null);

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const terrain = bakeTerrain(genTerrain(WORLD_W, WORLD_H, SEED), WORLD_W, WORLD_H, SEED);
    const fog = document.createElement("canvas");
    const SUB = 4; // fog resolution: 4×4 cells per tile, ordered-dithered
    fog.width = WORLD_W * SUB;
    fog.height = WORLD_H * SUB;
    const fctx = fog.getContext("2d")!;
    const fimg = fctx.createImageData(fog.width, fog.height);
    const css = getComputedStyle(document.body);
    const pixelFont = css.getPropertyValue("--font-silkscreen").trim() || "monospace";
    const sansFont = css.getPropertyValue("--font-geist").trim() || "system-ui, sans-serif";
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const cam = { x: (WORLD_W * TILE) / 2, y: (WORLD_H * TILE) / 2, z: 2.2, tx: 0, ty: 0, tz: 2.2 };
    cam.tx = cam.x; cam.ty = cam.y;
    let userMovedAt = 0;
    const fogR = new Map<string, number>(); // animated fog radius per node
    const spawned = new Map<string, number>(); // slug → first-seen time (drop-in animation)
    const freshUntil = new Map<string, number>(); // blocks added after first load keep their label for a few seconds
    const particles: Particle[] = [];
    let w = 0, h = 0, dpr = 1;
    let hover: string | null = null;
    let lastFogSig = "";
    let lastCount = -1;
    let lastFit = live.current.fitKey ?? 0;

    const resize = () => {
      const el = wrap.current;
      if (!el) return; // can fire once after unmount
      const r = el.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap.current!);
    resize();

    const bounds = () => {
      const cs = live.current.concepts.filter((c) => live.current.nodes[c.slug] && c.x !== undefined);
      if (!cs.length) return null;
      const xs = cs.map((c) => c.x!), ys = cs.map((c) => c.y!);
      return { x0: Math.min(...xs) - 3, x1: Math.max(...xs) + 5, y0: Math.min(...ys) - 3, y1: Math.max(...ys) + 5 };
    };
    const fit = () => {
      const b = bounds();
      if (!b) return;
      cam.tx = ((b.x0 + b.x1) / 2) * TILE;
      cam.ty = ((b.y0 + b.y1) / 2) * TILE;
      cam.tz = Math.max(0.9, Math.min(4, Math.min(w / ((b.x1 - b.x0) * TILE), h / ((b.y1 - b.y0) * TILE))));
    };
    const zoom = (f: number, sx = w / 2, sy = h / 2) => {
      const wx = cam.x + (sx - w / 2) / cam.z, wy = cam.y + (sy - h / 2) / cam.z;
      const nz = Math.max(0.6, Math.min(7, cam.tz * f));
      cam.tz = nz; cam.z = nz;
      cam.x = cam.tx = wx - (sx - w / 2) / nz;
      cam.y = cam.ty = wy - (sy - h / 2) / nz;
      userMovedAt = performance.now();
    };
    // Keyboard focus on an off-screen block pans to it.
    const reveal = (slug: string) => {
      const c = live.current.concepts.find((x) => x.slug === slug);
      if (!c || c.x === undefined) return;
      const sx = w / 2 + (c.x * TILE - cam.x) * cam.z, sy = h / 2 + (c.y! * TILE - cam.y) * cam.z;
      if (sx < 40 || sx > w - 60 || sy < 40 || sy > h - 60) { cam.tx = (c.x + 0.5) * TILE; cam.ty = (c.y! + 0.5) * TILE; userMovedAt = performance.now(); }
    };
    api.current = { zoom: (f) => zoom(f), fit: () => { userMovedAt = 0; fit(); }, reveal };

    const toWorld = (sx: number, sy: number) => ({ x: cam.x + (sx - w / 2) / cam.z, y: cam.y + (sy - h / 2) / cam.z });
    const hit = (sx: number, sy: number) => {
      const p = toWorld(sx, sy);
      const { concepts, nodes } = live.current;
      for (const c of concepts) {
        const n = nodes[c.slug];
        if (!n || c.x === undefined) continue;
        const s = sizeFor(n.mastery) * TILE;
        if (p.x >= c.x * TILE - 3 && p.x <= c.x * TILE + s + 3 && p.y >= c.y! * TILE - 3 && p.y <= c.y! * TILE + s + 3) return c.slug;
      }
      return null;
    };

    // Pointer: drag to pan, click to select, wheel / pinch-free zoom.
    let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }; };
    const move = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        if (drag.moved) {
          cam.x = cam.tx = drag.cx - dx / cam.z;
          cam.y = cam.ty = drag.cy - dy / cam.z;
          userMovedAt = performance.now();
        }
      }
      hover = hit(e.clientX - r.left, e.clientY - r.top);
      cv.style.cursor = drag?.moved ? "grabbing" : hover ? "pointer" : "grab";
    };
    const up = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      if (drag && !drag.moved) live.current.onSelect(hit(e.clientX - r.left, e.clientY - r.top));
      drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("wheel", wheel, { passive: false });

    const burst = (x: number, y: number, cols: string[], n = 18) => {
      if (mq.matches) return;
      for (let i = 0; i < n; i++)
        particles.push({ x, y, vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 110 - 20, life: 0, max: 0.6 + Math.random() * 0.5, col: cols[i % cols.length], size: 2 });
    };

    let raf = 0;
    let prev = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - prev) / 1000);
      prev = t;
      const { concepts, edges, nodes, explorers, selected, now, fitKey, holdCamera } = live.current;
      const still = mq.matches;
      const onMap = concepts.filter((c) => nodes[c.slug] && c.x !== undefined);
      const bySlug = new Map(onMap.map((c) => [c.slug, c]));

      // New nodes: record spawn, burst particles, refit camera unless the user is steering.
      for (const [i, c] of onMap.entries()) {
        if (!spawned.has(c.slug)) {
          spawned.set(c.slug, t + (lastCount < 0 ? i * 70 : 0));
          if (lastCount >= 0) freshUntil.set(c.slug, t + 6000);
          const kind = blockKindFor(nodes[c.slug].state, nodes[c.slug].mastery);
          setTimeout(() => burst((c.x! + 0.5) * TILE, (c.y! + 0.5) * TILE, kind === "diamond" ? ["#4ddfe6", "#fff"] : ["#9a9a9a", "#6a6a6a", "#d8d5cf"]), lastCount < 0 ? i * 70 + 300 : 300);
        }
      }
      for (const s of [...spawned.keys()]) if (!bySlug.has(s)) { spawned.delete(s); fogR.delete(s); }
      if (onMap.length !== lastCount || (fitKey ?? 0) !== lastFit) {
        if (lastCount < 0 || (fitKey ?? 0) !== lastFit || (!holdCamera && t - userMovedAt > 5000)) fit();
        if (lastCount < 0) { cam.x = cam.tx; cam.y = cam.ty; cam.z = cam.tz; }
        lastCount = onMap.length;
        lastFit = fitKey ?? 0;
      }
      const k = still ? 1 : 1 - Math.pow(0.002, dt);
      cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; cam.z += (cam.tz - cam.z) * k;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#07070a";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (w / 2 - cam.x * cam.z), dpr * (h / 2 - cam.y * cam.z));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(terrain, 0, 0);

      // Paths (L-shaped tile routes). Rails = prerequisite, roads = part_of, dirt = related.
      for (const e of edges) {
        const a = bySlug.get(e.src), b = bySlug.get(e.dst);
        if (!a || !b) continue;
        const ax = a.x!, ay = a.y!, bx = b.x!, by = b.y!;
        const hx = pathTexture(e.kind, "h"), vy = pathTexture(e.kind, "v");
        const alpha = Math.min(opacityFor(liveInterest(nodes[a.slug], now)), opacityFor(liveInterest(nodes[b.slug], now)));
        ctx.globalAlpha = 0.35 + alpha * 0.65;
        for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) ctx.drawImage(hx, x * TILE, ay * TILE);
        for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) ctx.drawImage(vy, bx * TILE, y * TILE);
        ctx.globalAlpha = 1;
      }

      // Fog of war: revealed by interest + mastery. Recomputed only when it changes.
      let sig = "";
      for (const c of onMap) {
        const target = revealFor({ ...nodes[c.slug], interest: liveInterest(nodes[c.slug], now) });
        const cur = fogR.get(c.slug) ?? 0;
        const nv = still || Math.abs(target - cur) < 0.02 ? target : cur + (target - cur) * (1 - Math.pow(0.01, dt));
        fogR.set(c.slug, nv);
        sig += `${c.slug}:${nv.toFixed(2)};`;
      }
      if (sig !== lastFogSig) {
        lastFogSig = sig;
        const pts = onMap.map((c) => ({ x: c.x! + sizeFor(nodes[c.slug].mastery) / 2, y: c.y! + sizeFor(nodes[c.slug].mastery) / 2, r: fogR.get(c.slug)! }));
        const d = fimg.data;
        for (let fy = 0; fy < fog.height; fy++)
          for (let fx = 0; fx < fog.width; fx++) {
            const wx = (fx + 0.5) / SUB, wy = (fy + 0.5) / SUB;
            let v = 0;
            for (const p of pts) {
              const dd = Math.hypot(wx - p.x, (wy - p.y) * 1.1);
              v = Math.max(v, Math.min(1, Math.max(0, 1 - (dd - p.r) / 3)));
            }
            const a = 1 - v;
            const lvl = Math.floor(a * 3 + BAYER[(fy % 4) * 4 + (fx % 4)] / 16);
            const i = (fy * fog.width + fx) * 4;
            d[i] = 7; d[i + 1] = 7; d[i + 2] = 11;
            d[i + 3] = [0, 120, 195, 238][Math.min(3, lvl)];
          }
        fctx.putImageData(fimg, 0, 0);
      }
      ctx.drawImage(fog, 0, 0, WORLD_W * TILE, WORLD_H * TILE);

      // Faint chunk grid over the world.
      ctx.strokeStyle = "rgba(255,255,255,0.035)";
      ctx.lineWidth = 1 / cam.z;
      ctx.beginPath();
      for (let x = 0; x <= WORLD_W; x += 8) { ctx.moveTo(x * TILE, 0); ctx.lineTo(x * TILE, WORLD_H * TILE); }
      for (let y = 0; y <= WORLD_H; y += 8) { ctx.moveTo(0, y * TILE); ctx.lineTo(WORLD_W * TILE, y * TILE); }
      ctx.stroke();

      // Blocks. Collect screen rects for labels and the keyboard overlay.
      const toScreen = (wx: number, wy: number) => ({ x: w / 2 + (wx - cam.x) * cam.z, y: h / 2 + (wy - cam.y) * cam.z });
      const neighbours = new Set<string>();
      if (selected) for (const e of edges) { if (e.src === selected) neighbours.add(e.dst); if (e.dst === selected) neighbours.add(e.src); }
      const zoomedIn = cam.z >= 3.2;
      const rects: { slug: string; x0: number; y0: number; x1: number; y1: number }[] = [];
      const tags: { slug?: string; box?: { x0: number; y0: number; x1: number; y1: number }; text: string; pri: number; sel: boolean; alpha: number; peer?: boolean }[] = [];
      for (const c of onMap) {
        const n = nodes[c.slug];
        const size = sizeFor(n.mastery) * TILE;
        const kind = blockKindFor(n.state, n.mastery);
        const st = spawned.get(c.slug) ?? t;
        const p = still ? 1 : Math.max(0, Math.min(1, (t - st) / 450));
        if (p <= 0) continue;
        const bounce = 1 - Math.pow(1 - p, 3);
        const x = c.x! * TILE, y = c.y! * TILE - (1 - bounce) * 26;
        const alpha = opacityFor(liveInterest(n, now)) * p;
        if (n.state === "understood") {
          const g = ctx.createRadialGradient(x + size / 2, y + size / 2, 2, x + size / 2, y + size / 2, size * 1.6);
          const flick = still ? 0.35 : 0.35 + Math.sin(t / 180 + hashStr(c.slug)) * 0.06;
          g.addColorStop(0, `rgba(255,190,90,${flick})`);
          g.addColorStop(1, "rgba(255,150,40,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - size * 1.6, y - size * 1.6, size * 4.2, size * 4.2);
          if (!still && Math.random() < dt * 3) particles.push({ x: x + Math.random() * size, y: y + size * 0.3, vx: 0, vy: -14, life: 0, max: 1.2, col: "#ffd27a", size: 1 });
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(0,0,0,.35)";
        ctx.fillRect(x + 2, y + 3, size, size);
        ctx.fillStyle = "#000";
        ctx.fillRect(x - 1, y - 1, size + 2, size + 2);
        ctx.drawImage(blockTexture(kind, size, hashStr(c.slug)), x, y);
        if (n.state === "seeded") {
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${size * 0.6}px ${pixelFont}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("?", x + size / 2, y + size / 2 + 1);
        }
        if (n.state === "understood") {
          // Torch
          ctx.fillStyle = "#6b4a2b";
          ctx.fillRect(x + size + 2, y + size - 7, 2, 6);
          ctx.fillStyle = Math.sin(t / 90) > 0 ? "#ffd84a" : "#ff9a2e";
          ctx.fillRect(x + size + 1.5, y + size - 10, 3, 3);
        }
        ctx.globalAlpha = 1;
        const sel = selected === c.slug;
        const foc = focusSlug.current === c.slug;
        if (sel || hover === c.slug || foc) {
          // Mission-control corner brackets
          const pad = 3 + (sel && !still ? Math.sin(t / 200) * 1.2 + 1 : sel ? 1 : 0);
          const L = 4;
          ctx.strokeStyle = sel ? "#f26b1d" : "rgba(255,255,255,.9)";
          ctx.lineWidth = 1.5 / Math.min(cam.z, 2.5);
          const x0 = x - pad, y0 = y - pad, x1 = x + size + pad, y1 = y + size + pad;
          ctx.beginPath();
          ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
          ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
          ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
          ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
          ctx.stroke();
        }
        const a0 = toScreen(c.x! * TILE, c.y! * TILE), a1 = toScreen(c.x! * TILE + size, c.y! * TILE + size);
        rects.push({ slug: c.slug, x0: a0.x, y0: a0.y, x1: a1.x, y1: a1.y });
        const btn = btns.current.get(c.slug);
        if (btn) { btn.style.transform = `translate(${a0.x - 3}px, ${a0.y - 3}px)`; btn.style.width = `${a1.x - a0.x + 6}px`; btn.style.height = `${a1.y - a0.y + 6}px`; }
        const fresh = (freshUntil.get(c.slug) ?? 0) > t;
        const pri = sel ? 0 : foc ? 1 : hover === c.slug ? 2 : neighbours.has(c.slug) ? 3 : n.state === "understood" ? 4 : fresh ? 5 : zoomedIn ? 6 : -1;
        if (pri >= 0) tags.push({ slug: c.slug, box: { x0: a0.x, y0: a0.y, x1: a1.x, y1: a1.y }, text: c.title, pri, sel, alpha: Math.max(0.75, alpha) });
      }

      // Player heads for present explorers, beside the first concept of theirs on the map.
      // Drawn in world space before labels, so labels always sit on top of avatars.
      const stack = new Map<string, number>();
      for (const ex of explorers) {
        const at = ex.activeConcepts.find((s) => bySlug.has(s));
        if (!at) continue;
        const c = bySlug.get(at)!;
        const i = stack.get(at) ?? 0;
        stack.set(at, i + 1);
        const size = sizeFor(nodes[at].mastery) * TILE;
        const hx = c.x! * TILE + size + 4 + i * 11, hy = c.y! * TILE + size - 6 + (still ? 0 : Math.sin(t / 300 + i) * 1.2);
        drawHead(ctx, hx, hy, 1.1, ex.color);
        const h0 = toScreen(hx, hy), h1 = toScreen(hx + 8.8, hy + 8.8);
        tags.push({ box: { x0: h0.x, y0: h0.y, x1: h1.x, y1: h1.y }, text: ex.name, pri: 7, sel: false, alpha: 0.95, peer: true });
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.life += dt;
        if (q.life > q.max) { particles.splice(i, 1); continue; }
        q.vy += (q.size > 1 ? 260 : 0) * dt;
        q.x += q.vx * dt; q.y += q.vy * dt;
        ctx.globalAlpha = 1 - q.life / q.max;
        ctx.fillStyle = q.col;
        ctx.fillRect(q.x, q.y, q.size, q.size);
      }
      ctx.globalAlpha = 1;

      // Labels in screen space so text stays crisp at any zoom. Highest priority places first;
      // each tries above, below, right, left of its block and is skipped if all four collide
      // with a placed label or another block. Selected and focused labels always draw.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      type R = { x0: number; y0: number; x1: number; y1: number };
      const placed: R[] = [];
      const hits = (r: R, own?: string) =>
        placed.some((p) => r.x0 < p.x1 + 3 && r.x1 > p.x0 - 3 && r.y0 < p.y1 + 2 && r.y1 > p.y0 - 2) ||
        rects.some((b) => b.slug !== own && r.x0 < b.x1 && r.x1 > b.x0 && r.y0 < b.y1 && r.y1 > b.y0);
      tags.sort((a, b) => a.pri - b.pri);
      const LH = 20;
      for (const g of tags) {
        const b = g.box!;
        if (b.x1 < -150 || b.x0 > w + 150 || b.y1 < -40 || b.y0 > h + 40) continue;
        ctx.font = `${g.sel ? 600 : 500} ${g.peer ? 11 : 12}px ${sansFont}`;
        const tw = Math.ceil(ctx.measureText(g.text).width) + 12;
        const lh = g.peer ? 17 : LH;
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        const cands: R[] = g.peer
          ? [{ x0: b.x1 + 3, y0: cy - lh / 2, x1: b.x1 + 3 + tw, y1: cy + lh / 2 }, { x0: cx - tw / 2, y0: b.y1 + 2, x1: cx + tw / 2, y1: b.y1 + 2 + lh }]
          : [
              { x0: cx - tw / 2, y0: b.y0 - 4 - lh, x1: cx + tw / 2, y1: b.y0 - 4 },
              { x0: cx - tw / 2, y0: b.y1 + 4, x1: cx + tw / 2, y1: b.y1 + 4 + lh },
              { x0: b.x1 + 6, y0: cy - lh / 2, x1: b.x1 + 6 + tw, y1: cy + lh / 2 },
              { x0: b.x0 - 6 - tw, y0: cy - lh / 2, x1: b.x0 - 6, y1: cy + lh / 2 },
            ];
        const onScreen = (c: R) => c.x0 >= 4 && c.x1 <= w - 4 && c.y0 >= 4 && c.y1 <= h - 4;
        let r = cands.find((c) => onScreen(c) && !hits(c, g.slug));
        if (!r && g.pri <= 1) r = cands[0];
        if (!r) continue;
        placed.push(r);
        const x0 = Math.round(r.x0), y0 = Math.round(r.y0);
        ctx.globalAlpha = g.alpha;
        ctx.fillStyle = g.sel ? "#f26b1d" : "rgba(10,10,11,.92)";
        ctx.fillRect(x0, y0, Math.round(r.x1 - r.x0), lh);
        if (!g.sel) { ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.round(r.x1 - r.x0) - 1, lh - 1); }
        ctx.fillStyle = g.sel ? "#0a0a0b" : g.peer ? "#d8d5cf" : "#f2f0ea";
        ctx.fillText(g.text, x0 + 6, y0 + lh / 2 + 0.5);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("wheel", wheel);
    };
  }, []);

  // Keyboard layer: one focusable button per block, in reading order (top-left first).
  const onMap = useMemo(
    () => props.concepts.filter((c) => props.nodes[c.slug] && c.x !== undefined).sort((a, b) => a.y! - b.y! || a.x! - b.x!),
    [props.concepts, props.nodes],
  );
  const moveFocus = (from: string, key: string) => {
    const a = onMap.find((c) => c.slug === from);
    if (!a) return;
    const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[key];
    if (!dir) return;
    let best: string | null = null, bestD = Infinity;
    for (const c of onMap) {
      if (c.slug === from) continue;
      const dx = c.x! - a.x!, dy = c.y! - a.y!;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 0) continue;
      const across = Math.abs(dx * dir[1] - dy * dir[0]);
      const d = along + across * 2;
      if (d < bestD) { bestD = d; best = c.slug; }
    }
    if (best) btns.current.get(best)?.focus();
  };

  return (
    <div ref={wrap} className="absolute inset-0 overflow-hidden touch-none select-none">
      <canvas ref={canvas} className="block" role="img" aria-label="Map of your concepts" />
      <div role="group" aria-label="Concepts on your map. Arrow keys move between blocks, Enter opens one." className="pointer-events-none absolute inset-0">
        {onMap.map((c) => {
          const n = props.nodes[c.slug];
          return (
            <button
              key={c.slug}
              ref={(el) => { if (el) btns.current.set(c.slug, el); else btns.current.delete(c.slug); }}
              className="absolute left-0 top-0 h-0 w-0 bg-transparent"
              style={{ willChange: "transform" }}
              aria-label={`${c.title}, ${STATE_LABEL[n.state]}`}
              aria-pressed={props.selected === c.slug}
              onFocus={() => { focusSlug.current = c.slug; api.current?.reveal(c.slug); }}
              onBlur={() => { if (focusSlug.current === c.slug) focusSlug.current = null; }}
              onClick={() => props.onSelect(c.slug)}
              onKeyDown={(e) => { if (e.key.startsWith("Arrow")) { e.preventDefault(); moveFocus(c.slug, e.key); } }}
            />
          );
        })}
      </div>
      <div className="absolute right-3 bottom-3 flex flex-col border border-line bg-panel/90 backdrop-blur">
        <button className="map-btn" onClick={() => api.current?.zoom(1.25)} aria-label="Zoom in" title="Zoom in">+</button>
        <button className="map-btn border-t border-line" onClick={() => api.current?.zoom(0.8)} aria-label="Zoom out" title="Zoom out">−</button>
        <button className="map-btn border-t border-line font-mono text-2xs" onClick={() => api.current?.fit()} aria-label="Fit map to your concepts" title="Fit map to your concepts">FIT</button>
      </div>
    </div>
  );
}
