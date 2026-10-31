// Procedural pixel art for the world map. Every texture is generated from seeded
// noise at 16×16, so there are no image assets and nothing is copied from Minecraft.
import type { EdgeKind } from "@/lib/types";

export const TILE = 16;

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function valueNoise(seed: number) {
  const r = rng(seed);
  const perm = Array.from({ length: 512 }, () => r());
  const at = (x: number, y: number) => perm[(((x * 73856093) ^ (y * 19349663)) >>> 0) % 512];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t));
  const n = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    return lerp(lerp(at(xi, yi), at(xi + 1, yi), xf), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), xf), yf);
  };
  return (x: number, y: number) => (n(x, y) * 0.6 + n(x * 2.1, y * 2.1) * 0.28 + n(x * 4.3, y * 4.3) * 0.12);
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const PAL = {
  deep: ["#1d3f86", "#22488f", "#1a3a7d"].map(hex),
  water: ["#2f5fb3", "#3468be", "#2b58a6"].map(hex),
  sand: ["#d8c27c", "#cfb871", "#e0cb88"].map(hex),
  grass: ["#5b9e3b", "#4f8f33", "#67ac44", "#56993a"].map(hex),
  stone: ["#6f7a66", "#66705e", "#77826d", "#5f6858"].map(hex),
};

export type Terrain = "deep" | "water" | "sand" | "grass" | "forest" | "stone";

export function genTerrain(W: number, H: number, seed: number) {
  const elev = valueNoise(seed);
  const veg = valueNoise(seed + 99);
  const grid: Terrain[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      const e = elev(x / 9, y / 9) + 0.42 - d * 0.62;
      const v = veg(x / 6, y / 6);
      grid.push(e < 0.12 ? "deep" : e < 0.24 ? "water" : e < 0.3 ? "sand" : e > 0.9 ? "stone" : v > 0.62 ? "forest" : "grass");
    }
  return grid;
}

/** Bakes the terrain into one canvas at 16px per tile. Done once per world. */
export function bakeTerrain(grid: Terrain[], W: number, H: number, seed: number) {
  const c = document.createElement("canvas");
  c.width = W * TILE;
  c.height = H * TILE;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(c.width, c.height);
  const r = rng(seed + 7);
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      const t = grid[ty * W + tx];
      const pal = t === "forest" ? PAL.grass : PAL[t];
      for (let py = 0; py < TILE; py++)
        for (let px = 0; px < TILE; px++) {
          let col = pal[Math.floor(r() * pal.length)];
          if ((t === "water" || t === "deep") && (px + py * 3 + tx * 5) % 11 === 0 && py % 4 === 1) col = hex("#5f8fdc");
          if (t === "grass" && r() < 0.004) col = r() < 0.5 ? hex("#f2e05a") : hex("#e7584f");
          const i = ((ty * TILE + py) * c.width + tx * TILE + px) * 4;
          img.data[i] = col[0];
          img.data[i + 1] = col[1];
          img.data[i + 2] = col[2];
          img.data[i + 3] = 255;
        }
    }
  ctx.putImageData(img, 0, 0);
  // Trees: dark canopy + trunk, drawn on forest tiles.
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      if (grid[ty * W + tx] !== "forest" || r() < 0.35) continue;
      const ox = tx * TILE + 2, oy = ty * TILE + 1;
      ctx.fillStyle = "rgba(0,0,0,.28)";
      ctx.fillRect(ox + 2, oy + 11, 12, 4);
      ctx.fillStyle = "#6b4a2b";
      ctx.fillRect(ox + 5, oy + 9, 3, 5);
      ctx.fillStyle = "#2f6b24";
      ctx.fillRect(ox + 1, oy + 2, 11, 8);
      ctx.fillRect(ox + 3, oy, 7, 12);
      ctx.fillStyle = "#3f8a2f";
      ctx.fillRect(ox + 3, oy + 2, 4, 3);
      ctx.fillStyle = "#245a1c";
      ctx.fillRect(ox + 8, oy + 6, 3, 3);
    }
  return c;
}

export type BlockKind = "cobble" | "iron" | "gold" | "diamond";

const blockCache = new Map<string, HTMLCanvasElement>();

/** A bevelled block texture. size is in pixels (16 or 32). */
export function blockTexture(kind: BlockKind, size: number, seed = 1) {
  const key = `${kind}:${size}:${seed % 4}`;
  const hit = blockCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const r = rng(seed * 31 + size);
  const s = size / 16;
  const px = (x: number, y: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x * s), Math.round(y * s), Math.ceil(s), Math.ceil(s));
  };
  const stone = ["#828282", "#767676", "#8e8e8e", "#6c6c6c"];
  const base = kind === "diamond" ? ["#4ddfe6", "#45d2d9", "#5fe9ef"] : kind === "cobble" ? ["#7a7a7a", "#6a6a6a", "#8c8c8c", "#5a5a5a"] : stone;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, base[Math.floor(r() * base.length)]);
  if (kind === "cobble") {
    for (let k = 0; k < 7; k++) {
      const cx = Math.floor(r() * 13), cy = Math.floor(r() * 13);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) px(cx + x, cy + y, y === 0 ? "#9a9a9a" : "#646464");
      px(cx + 4, cy + 1, "#4a4a4a");
    }
  }
  if (kind === "iron" || kind === "gold") {
    const ore = kind === "iron" ? ["#d8af93", "#e8c9b0", "#a8826a"] : ["#fcee4b", "#f5c542", "#c79a1e"];
    for (let k = 0; k < 6; k++) {
      const cx = 1 + Math.floor(r() * 12), cy = 1 + Math.floor(r() * 12);
      px(cx, cy, ore[0]); px(cx + 1, cy, ore[1]); px(cx, cy + 1, ore[2]); if (r() > 0.4) px(cx + 1, cy + 1, ore[0]);
    }
  }
  if (kind === "diamond") {
    for (let i = 2; i < 14; i++) { px(i, 2, "#a8f5f7"); px(2, i, "#a8f5f7"); px(i, 13, "#24a8ae"); px(13, i, "#24a8ae"); }
    for (const [x, y] of [[5, 5], [10, 5], [7, 8], [5, 10], [10, 10]]) { px(x, y, "#ffffff"); px(x + 1, y, "#c9fbfc"); }
  }
  // Bevel: light top/left, dark bottom/right. Reads as a 3D block from above.
  for (let i = 0; i < 16; i++) {
    px(i, 0, "rgba(255,255,255,.35)"); px(0, i, "rgba(255,255,255,.25)");
    px(i, 15, "rgba(0,0,0,.45)"); px(15, i, "rgba(0,0,0,.35)");
  }
  blockCache.set(key, c);
  return c;
}

const pathCache = new Map<string, HTMLCanvasElement>();

/** Path tile for an edge kind. `dir` h = horizontal, v = vertical. */
export function pathTexture(kind: EdgeKind, dir: "h" | "v") {
  const key = `${kind}:${dir}`;
  const hit = pathCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = TILE;
  const ctx = c.getContext("2d")!;
  const r = rng(hashStr(key));
  const f = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    dir === "h" ? ctx.fillRect(x, y, w, h) : ctx.fillRect(y, x, h, w);
  };
  if (kind === "related") {
    // Dirt path
    for (let x = 0; x < 16; x++) for (let y = 4; y < 12; y++) f(x, y, 1, 1, ["#96693f", "#8a5f37", "#a3774a", "#7a5230"][Math.floor(r() * 4)]);
  } else if (kind === "part_of") {
    // Stone-brick road
    for (let x = 0; x < 16; x++) for (let y = 3; y < 13; y++) f(x, y, 1, 1, ["#8f8f8f", "#858585", "#999999"][Math.floor(r() * 3)]);
    f(0, 7, 16, 1, "#5e5e5e"); f(0, 3, 16, 1, "#5e5e5e"); f(0, 12, 16, 1, "#5e5e5e");
    f(7, 3, 1, 4, "#5e5e5e"); f(3, 8, 1, 4, "#5e5e5e"); f(12, 8, 1, 4, "#5e5e5e");
  } else {
    // Rail track: wooden ties + iron rails
    for (let x = 1; x < 16; x += 4) f(x, 3, 2, 10, "#6b4a2b");
    f(0, 5, 16, 1, "#b0b0b0"); f(0, 10, 16, 1, "#b0b0b0");
    f(0, 6, 16, 1, "#6f6f6f"); f(0, 11, 16, 1, "#6f6f6f");
  }
  pathCache.set(key, c);
  return c;
}

/** 8×8 player head. Hair uses the explorer's colour. */
export function drawHead(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, hair: string) {
  const p = (cx: number, cy: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x + cx * s, y + cy * s, s, s);
  };
  for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) p(cx, cy, cy < 2 || (cy < 3 && (cx === 0 || cx === 7)) ? hair : "#c99772");
  p(1, 4, "#ffffff"); p(2, 4, "#2a2a6a"); p(5, 4, "#2a2a6a"); p(6, 4, "#ffffff");
  p(3, 6, "#8a5a44"); p(4, 6, "#8a5a44");
  ctx.strokeStyle = "rgba(0,0,0,.6)";
  ctx.lineWidth = Math.max(1, s / 2);
  ctx.strokeRect(x, y, 8 * s, 8 * s);
}

export function blockKindFor(state: string, mastery: number): BlockKind {
  if (state === "understood") return "diamond";
  if (state === "explored") return mastery >= 0.3 ? "gold" : "iron";
  return "cobble";
}
