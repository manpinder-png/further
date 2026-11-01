// Radial flowchart layout for the knowledge map (DESIGN D34).
// You sit at the centre. Rings are state: understood (inner, lit) → explored → on your map
// (outer, in the fog). Suggested topics sit just beyond the topic they grow from.
// Angle comes from the concept tree, so a topic and its children stay in the same direction.
// Fading topics (low interest) drift outward. Deterministic: same input, same picture.
import type { Edge, NodeState } from "./types";

export type LState = NodeState | "suggested";
export interface LNode {
  slug: string;
  state: LState;
  mastery: number;
  interest: number;
  /** Suggested topics: the on-map topic they grow from. */
  anchor?: string;
  /** Card width, sized to the title. */
  w?: number;
}
export interface Placed { x: number; y: number; w: number; h: number }
export interface Ring { r: number; label: string }

export const CARD: Record<LState, { w: number; h: number; min: number; max: number; char: number; extra: number }> = {
  understood: { w: 190, h: 54, min: 150, max: 260, char: 10, extra: 88 },
  explored: { w: 170, h: 50, min: 130, max: 240, char: 9, extra: 54 },
  seeded: { w: 150, h: 38, min: 110, max: 220, char: 8.2, extra: 50 },
  suggested: { w: 160, h: 46, min: 130, max: 230, char: 8.2, extra: 50 },
};
/** Card width that fits the title on one line. */
export const cardWidth = (state: LState, title: string) => {
  const c = CARD[state];
  return Math.round(Math.max(c.min, Math.min(c.max, title.length * c.char + c.extra)));
};
export const YOU = { w: 116, h: 116 };
/** The map is wider than tall, so rings are ellipses. */
export const SX = 1.2;
export const SY = 0.86;

const RANK: Record<NodeState, number> = { understood: 0, explored: 1, seeded: 2 };
const RING_LABEL = ["Understood", "Exploring", "On your map"];
const PAD = 12;

export function layoutRadial(list: LNode[], edges: Edge[]): { pos: Record<string, Placed>; rings: Ring[] } {
  const by = new Map(list.map((n) => [n.slug, n]));
  const real = list.filter((n) => n.state !== "suggested");
  const ghosts = list.filter((n) => n.state === "suggested");

  // 1. A spanning tree over the concept graph (first-seen order keeps it stable as it grows).
  const out = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of real) { out.set(n.slug, []); indeg.set(n.slug, 0); }
  for (const e of edges) {
    if (e.src === e.dst || !out.has(e.src) || !out.has(e.dst)) continue;
    out.get(e.src)!.push(e.dst);
    indeg.set(e.dst, indeg.get(e.dst)! + 1);
  }
  const kids = new Map<string, string[]>(list.map((n) => [n.slug, []]));
  const roots: string[] = [];
  const seen = new Set<string>();
  const grow = (root: string) => {
    roots.push(root);
    seen.add(root);
    const q = [root];
    while (q.length) {
      const s = q.shift()!;
      for (const d of out.get(s) ?? []) if (!seen.has(d)) { seen.add(d); kids.get(s)!.push(d); q.push(d); }
    }
  };
  for (const n of real) if (indeg.get(n.slug) === 0 && !seen.has(n.slug)) grow(n.slug);
  for (const n of real) if (!seen.has(n.slug)) grow(n.slug); // cycles
  for (const g of ghosts) {
    if (g.anchor && kids.has(g.anchor)) kids.get(g.anchor)!.push(g.slug);
    else roots.push(g.slug);
  }

  // 2. In-order slots: a parent sits in the middle of its children.
  const order: string[] = [];
  const visit = (s: string) => {
    const k = kids.get(s) ?? [];
    const half = Math.floor(k.length / 2);
    k.slice(0, half).forEach(visit);
    order.push(s);
    k.slice(half).forEach(visit);
  };
  roots.forEach(visit);

  // 3. Ring radii sized to fit their cards.
  // Each card needs roughly a blend of its width and height of arc (cards sit at all angles).
  const need = [0, 0, 0];
  for (const n of real) {
    const c = CARD[n.state];
    need[RANK[n.state as NodeState]] += (n.w ?? c.w) * 0.5 + c.h * 0.5 + PAD;
  }
  const radii: number[] = [];
  const rings: Ring[] = [];
  let r = 0;
  for (let k = 0; k < 3; k++) {
    if (need[k]) {
      r = Math.max(r === 0 ? 122 : r + 92, need[k] / (2 * Math.PI * ((SX + SY) / 2)));
      rings.push({ r, label: RING_LABEL[k] });
    }
    radii[k] = r || 122;
  }

  // 4. Place on the ellipse.
  const N = Math.max(1, order.length);
  const pos: Record<string, Placed> = {};
  order.forEach((s, i) => {
    const n = by.get(s)!;
    const a = -Math.PI / 2 + (2 * Math.PI * (i + 0.5)) / N;
    let rad: number;
    if (n.state === "suggested") {
      const anc = n.anchor ? by.get(n.anchor) : undefined;
      rad = (anc && anc.state !== "suggested" ? radii[RANK[anc.state]] : r) + 92;
    } else {
      rad = radii[RANK[n.state]] + (n.state === "understood" ? 0 : (1 - n.interest) * 36);
    }
    const c = CARD[n.state];
    pos[s] = { x: Math.cos(a) * rad * SX, y: Math.sin(a) * rad * SY, w: n.w ?? c.w, h: c.h };
  });

  // 5. Push overlapping cards apart (and away from You).
  const ids = order;
  const you: Placed = { x: 0, y: 0, ...YOU };
  const sep = (a: Placed, b: Placed, fixedB: boolean, salt: number) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const ox = (a.w + b.w) / 2 + PAD - Math.abs(dx);
    const oy = (a.h + b.h) / 2 + PAD - Math.abs(dy);
    if (ox <= 0 || oy <= 0) return false;
    const share = fixedB ? 1 : 0.5;
    if (ox < oy * 1.4) {
      const sx = dx === 0 ? (salt % 2 ? 1 : -1) : Math.sign(dx);
      a.x -= sx * ox * share;
      if (!fixedB) b.x += sx * ox * share;
    } else {
      const sy = dy === 0 ? (salt % 2 ? 1 : -1) : Math.sign(dy);
      a.y -= sy * oy * share;
      if (!fixedB) b.y += sy * oy * share;
    }
    return true;
  };
  for (let it = 0; it < 120; it++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) {
      const a = pos[ids[i]];
      if (sep(a, you, true, i)) moved = true;
      for (let j = i + 1; j < ids.length; j++) if (sep(a, pos[ids[j]], false, i + j)) moved = true;
    }
    if (!moved) break;
  }
  return { pos, rings };
}

/** Where a line from a card's centre toward (tx, ty) leaves the card. */
export function exitPoint(p: Placed, tx: number, ty: number, gap = 5) {
  const dx = tx - p.x, dy = ty - p.y;
  if (!dx && !dy) return { x: p.x, y: p.y };
  const hw = p.w / 2 + gap, hh = p.h / 2 + gap;
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: p.x + dx * t, y: p.y + dy * t };
}
