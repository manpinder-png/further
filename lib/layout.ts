// Tile placement for new concepts. Plan §3 suggested a force layout; on a tile
// world we instead search rings around the parent and snap to the grid (DESIGN D2).
import type { Concept } from "./types";

export const WORLD_W = 64;
export const WORLD_H = 44;

function h(s: string) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return x >>> 0;
}

export function placeNear(slug: string, parent: { x: number; y: number } | undefined, taken: Concept[]) {
  const origin = parent ?? { x: WORLD_W / 2, y: WORLD_H / 2 };
  const free = (x: number, y: number) =>
    x >= 4 && y >= 4 && x <= WORLD_W - 6 && y <= WORLD_H - 6 &&
    taken.every((c) => c.x === undefined || Math.max(Math.abs(c.x - x), Math.abs((c.y ?? 0) - y)) >= 4);
  const start = (h(slug) % 360) * (Math.PI / 180);
  for (let r = 6; r < 22; r += 1.5) {
    for (let k = 0; k < 16; k++) {
      const a = start + (k * Math.PI * 2) / 16;
      const x = Math.round(origin.x + Math.cos(a) * r);
      const y = Math.round(origin.y + Math.sin(a) * r * 0.75);
      if (free(x, y)) return { x, y };
    }
  }
  return { x: origin.x + 2, y: origin.y + 2 };
}
