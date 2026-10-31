"use client";
// The world: a top-down 2D tile map (DESIGN §2.2). Concepts are blocks, edges are
// paths, unexplored space is fog, other explorers are player heads.
// Rendering rules come from lib/math.ts so the time-lapse and live map agree.
import { useEffect, useRef } from "react";
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
  const api = useRef<{ zoom: (f: number) => void; fit: () => void }>(null);

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
    const pixelFont = getComputedStyle(document.body).getPropertyValue("--font-silkscreen").trim() || "monospace";

    const cam = { x: (WORLD_W * TILE) / 2, y: (WORLD_H * TILE) / 2, z: 2.2, tx: 0, ty: 0, tz: 2.2 };
    cam.tx = cam.x; cam.ty = cam.y;
    let userMovedAt = 0;
    const reveal = new Map<string, number>(); // animated fog radius per node
    const spawned = new Map<string, number>(); // slug → first-seen time (drop-in animation)
    const particles: Particle[] = [];
    let w = 0, h = 0, dpr = 1;
    let hover: string | null = null;
    let lastFogSig = "";
    let lastCount = -1;
    let lastFit = live.current.fitKey ?? 0;

    const resize = () => {
      const r = wrap.current!.getBoundingClientRect();
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
    api.current = { zoom: (f) => zoom(f), fit: () => { userMovedAt = 0; fit(); } };

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
      for (let i = 0; i < n; i++)
        particles.push({ x, y, vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 110 - 20, life: 0, max: 0.6 + Math.random() * 0.5, col: cols[i % cols.length], size: 2 });
    };

    let raf = 0;
    let prev = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - prev) / 1000);
      prev = t;
      const { concepts, edges, nodes, explorers, selected, now, fitKey, holdCamera } = live.current;
      const onMap = concepts.filter((c) => nodes[c.slug] && c.x !== undefined);
      const bySlug = new Map(onMap.map((c) => [c.slug, c]));

      // New nodes: record spawn, burst particles, refit camera unless the user is steering.
      for (const [i, c] of onMap.entries()) {
        if (!spawned.has(c.slug)) {
          spawned.set(c.slug, t + (lastCount < 0 ? i * 70 : 0));
          const kind = blockKindFor(nodes[c.slug].state, nodes[c.slug].mastery);
          setTimeout(() => burst((c.x! + 0.5) * TILE, (c.y! + 0.5) * TILE, kind === "diamond" ? ["#4ddfe6", "#fff"] : ["#9a9a9a", "#6a6a6a", "#f26b1d"]), lastCount < 0 ? i * 70 + 300 : 300);
        }
      }
      for (const s of [...spawned.keys()]) if (!bySlug.has(s)) { spawned.delete(s); reveal.delete(s); }
      if (onMap.length !== lastCount || (fitKey ?? 0) !== lastFit) {
        if (lastCount < 0 || (fitKey ?? 0) !== lastFit || (!holdCamera && t - userMovedAt > 5000)) fit();
        if (lastCount < 0) { cam.x = cam.tx; cam.y = cam.ty; cam.z = cam.tz; }
        lastCount = onMap.length;
        lastFit = fitKey ?? 0;
      }
      const k = 1 - Math.pow(0.002, dt);
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
        const cur = reveal.get(c.slug) ?? 0;
        const nv = Math.abs(target - cur) < 0.02 ? target : cur + (target - cur) * (1 - Math.pow(0.01, dt));
        reveal.set(c.slug, nv);
        sig += `${c.slug}:${nv.toFixed(2)};`;
      }
      if (sig !== lastFogSig) {
        lastFogSig = sig;
        const pts = onMap.map((c) => ({ x: c.x! + sizeFor(nodes[c.slug].mastery) / 2, y: c.y! + sizeFor(nodes[c.slug].mastery) / 2, r: reveal.get(c.slug)! }));
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

      // Mission-control chunk grid over the world.
      ctx.strokeStyle = "rgba(242,107,29,0.07)";
      ctx.lineWidth = 1 / cam.z;
      ctx.beginPath();
      for (let x = 0; x <= WORLD_W; x += 8) { ctx.moveTo(x * TILE, 0); ctx.lineTo(x * TILE, WORLD_H * TILE); }
      for (let y = 0; y <= WORLD_H; y += 8) { ctx.moveTo(0, y * TILE); ctx.lineTo(WORLD_W * TILE, y * TILE); }
      ctx.stroke();

      // Blocks
      const tags: { x: number; y: number; text: string; sub?: string; sel: boolean; alpha: number }[] = [];
      for (const c of onMap) {
        const n = nodes[c.slug];
        const size = sizeFor(n.mastery) * TILE;
        const kind = blockKindFor(n.state, n.mastery);
        const st = spawned.get(c.slug) ?? t;
        const p = Math.max(0, Math.min(1, (t - st) / 450));
        if (p <= 0) continue;
        const bounce = 1 - Math.pow(1 - p, 3);
        const x = c.x! * TILE, y = c.y! * TILE - (1 - bounce) * 26;
        const alpha = opacityFor(liveInterest(n, now)) * p;
        if (n.state === "understood") {
          const g = ctx.createRadialGradient(x + size / 2, y + size / 2, 2, x + size / 2, y + size / 2, size * 1.6);
          const flick = 0.35 + Math.sin(t / 180 + hashStr(c.slug)) * 0.06;
          g.addColorStop(0, `rgba(255,190,90,${flick})`);
          g.addColorStop(1, "rgba(255,150,40,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x - size * 1.6, y - size * 1.6, size * 4.2, size * 4.2);
          if (Math.random() < dt * 3) particles.push({ x: x + Math.random() * size, y: y + size * 0.3, vx: 0, vy: -14, life: 0, max: 1.2, col: "#ffd27a", size: 1 });
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
        if (sel || hover === c.slug) {
          // Mission-control corner brackets
          const pad = 3 + (sel ? Math.sin(t / 200) * 1.2 + 1 : 0);
          const L = 4;
          ctx.strokeStyle = sel ? "#f26b1d" : "rgba(255,255,255,.8)";
          ctx.lineWidth = 1.5 / Math.min(cam.z, 2.5);
          const x0 = x - pad, y0 = y - pad, x1 = x + size + pad, y1 = y + size + pad;
          ctx.beginPath();
          ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
          ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
          ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
          ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
          ctx.stroke();
        }
        tags.push({ x: x + size / 2, y: y - 4, text: c.title, sub: n.learnedWith ? `w/ ${n.learnedWith}` : undefined, sel, alpha: Math.max(0.45, alpha) });
      }

      // Player heads for present explorers, at the first concept of theirs on the map.
      const stack = new Map<string, number>();
      for (const ex of explorers) {
        const at = ex.activeConcepts.find((s) => bySlug.has(s));
        if (!at) continue;
        const c = bySlug.get(at)!;
        const i = stack.get(at) ?? 0;
        stack.set(at, i + 1);
        const size = sizeFor(nodes[at].mastery) * TILE;
        const hx = c.x! * TILE + size + 4 + i * 11, hy = c.y! * TILE + size - 6 + Math.sin(t / 300 + i) * 1.2;
        drawHead(ctx, hx, hy, 1.1, ex.color);
        tags.push({ x: hx + 4.4, y: hy + 14, text: `${ex.name}${ex.demo ? " · DEMO" : ""}`, sel: false, alpha: 0.9 });
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

      // Nametags in screen space so text stays crisp at any zoom.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Simple label collision: nudge a tag upward until it clears earlier ones. Selected draws last, on top.
      const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
      tags.sort((a, b) => Number(a.sel) - Number(b.sel));
      for (const g of tags) {
        const sx = w / 2 + (g.x - cam.x) * cam.z;
        let sy = h / 2 + (g.y - cam.y) * cam.z;
        if (sx < -100 || sx > w + 100 || sy < -40 || sy > h + 40) continue;
        ctx.font = `${g.sel ? 11 : 10}px ${pixelFont}`;
        const text = g.text.toUpperCase();
        const tw = ctx.measureText(text).width + 10;
        for (let k = 0; k < 4 && !g.sel; k++) {
          const r = { x0: sx - tw / 2, x1: sx + tw / 2, y0: sy - 16, y1: sy - 2 };
          if (!placed.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)) break;
          sy -= 15;
        }
        placed.push({ x0: sx - tw / 2, x1: sx + tw / 2, y0: sy - 16, y1: sy - 2 });
        ctx.globalAlpha = g.alpha;
        ctx.fillStyle = g.sel ? "rgba(242,107,29,.92)" : "rgba(0,0,0,.62)";
        ctx.fillRect(Math.round(sx - tw / 2), Math.round(sy - 16), Math.round(tw), 14);
        ctx.fillStyle = g.sel ? "#0a0a0b" : "#f2f0ea";
        ctx.fillText(text, Math.round(sx), Math.round(sy - 8.5));
        if (g.sub) {
          ctx.font = `9px ${pixelFont}`;
          ctx.fillStyle = "#4ddfe6";
          ctx.fillText(g.sub.toUpperCase(), Math.round(sx), Math.round(sy - 24));
        }
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

  return (
    <div ref={wrap} className="absolute inset-0 overflow-hidden touch-none select-none">
      <canvas ref={canvas} className="block" aria-label="Concept map. Use the inspector panel or list to navigate concepts." role="img" />
      <div className="absolute right-3 bottom-3 flex flex-col border border-line bg-panel/90 backdrop-blur">
        <button className="map-btn" onClick={() => api.current?.zoom(1.25)} aria-label="Zoom in">+</button>
        <button className="map-btn border-t border-line" onClick={() => api.current?.zoom(0.8)} aria-label="Zoom out">−</button>
        <button className="map-btn border-t border-line text-[9px]" onClick={() => api.current?.fit()} aria-label="Fit map">FIT</button>
      </div>
    </div>
  );
}
