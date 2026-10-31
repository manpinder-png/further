// DEMO DATA. Everything here is labeled DEMO in the UI.
// Owner for real content: Manpinder (seed concepts, 30 seed explorers, eval set).
import type { Concept, Edge, Explorer, FEvent, Profile, Resource, UserNode } from "../types";
import { replay } from "../math";

export const DOMAIN = "ai-tech";

/** Concept catalog. Positions only for concepts already on the starting map. */
export const CATALOG: Record<string, Concept> = Object.fromEntries(
  (
    [
      ["neural-networks", "Neural networks", "Layers of tiny weighted sums that learn by adjusting themselves.", 30, 21],
      ["backpropagation", "Backpropagation", "How a network figures out which weights to blame for a mistake.", 23, 16],
      ["embeddings", "Embeddings", "Turning words into coordinates so meaning becomes distance.", 37, 15],
      ["transformers", "Transformers", "The architecture behind every modern chatbot.", 39, 24],
      ["attention", "Attention", "Letting every word look at every other word at once.", 46, 19],
      ["training-vs-inference", "Training vs inference", "Learning is expensive. Answering is cheap. Here's why.", 30, 29],
      ["floating-point", "Floating point precision", "Why AI is happy with blurry numbers like FP16 and BF16.", 22, 30],
      ["quantization", "Quantization", "Shrinking a model by storing its numbers with fewer bits.", 17, 35],
      ["moores-law", "Moore's law", "The 60-year promise that chips keep doubling. Is it over?", 14, 23],
      // Not on the starting map. Arrive via voice bloom or MCP.
      ["ai-accelerators", "AI accelerators", "Chips built to do one kind of math absurdly fast.", 0, 0],
      ["parallel-computing", "Parallel computing", "Doing thousands of small math problems at once.", 0, 0],
      ["gpu", "GPUs", "Graphics chips that turned out to be perfect for AI.", 0, 0],
      ["matrix-multiplication", "Matrix multiplication", "The one operation neural nets do billions of times.", 0, 0],
      ["cuda", "CUDA", "The software layer that made GPUs programmable for science.", 0, 0],
      ["memory-bandwidth", "Memory bandwidth", "Why fast chips sit idle waiting for data.", 0, 0],
      ["tensor-cores", "Tensor cores", "Tiny circuits that do a whole matrix multiply in one step.", 0, 0],
      ["hbm", "HBM memory", "Memory stacked like pancakes right next to the chip.", 0, 0],
      ["tpu", "TPUs", "Google's chip that skips graphics entirely.", 0, 0],
      ["systolic-arrays", "Systolic arrays", "Data pulsing through a grid of multipliers like a heartbeat.", 0, 0],
      ["interconnect", "NVLink & interconnects", "How thousands of GPUs talk fast enough to act as one.", 0, 0],
      ["data-parallelism", "Data parallelism", "Copy the model, split the data, average what you learn.", 0, 0],
      ["chip-fabrication", "Chip fabrication", "Printing billions of switches with light.", 0, 0],
      ["power-cooling", "Power & cooling", "A training cluster draws as much power as a small town.", 0, 0],
    ] as const
  ).map(([slug, title, hook, x, y]) => [
    slug,
    { slug, title, hook, domain: DOMAIN, ...(x ? { x, y } : {}) } as Concept,
  ]),
);

export const START_SLUGS = Object.values(CATALOG)
  .filter((c) => c.x !== undefined)
  .map((c) => c.slug);

export const CATALOG_EDGES: Edge[] = [
  { src: "neural-networks", dst: "backpropagation", kind: "part_of" },
  { src: "neural-networks", dst: "embeddings", kind: "related" },
  { src: "neural-networks", dst: "transformers", kind: "prerequisite" },
  { src: "transformers", dst: "attention", kind: "part_of" },
  { src: "neural-networks", dst: "training-vs-inference", kind: "related" },
  { src: "training-vs-inference", dst: "floating-point", kind: "related" },
  { src: "floating-point", dst: "quantization", kind: "prerequisite" },
  { src: "neural-networks", dst: "moores-law", kind: "related" },
];

/** Demo-only: which on-map concept a catalog concept attaches to when it arrives alone. */
export const NEAR: Record<string, { from: string; kind: "prerequisite" | "related" | "part_of" }> = {
  hbm: { from: "memory-bandwidth", kind: "related" },
  tpu: { from: "ai-accelerators", kind: "part_of" },
  "systolic-arrays": { from: "matrix-multiplication", kind: "related" },
  interconnect: { from: "gpu", kind: "related" },
  "data-parallelism": { from: "parallel-computing", kind: "part_of" },
  "chip-fabrication": { from: "moores-law", kind: "related" },
  "power-cooling": { from: "ai-accelerators", kind: "related" },
};

/** Canned expansion for the demo script prompt (plan §2 step 1). */
export const DEMO_EXPANSION = {
  match: /chip|gpu|hardware|accelerat/i,
  intent: "Understand why AI training needs specialized hardware",
  root: "ai-accelerators",
  rootTitle: "AI accelerators",
  rootEdge: { from: "training-vs-inference", kind: "related" as const },
  nodes: [
    { slug: "parallel-computing", kind: "prerequisite", difficulty: 1 },
    { slug: "gpu", kind: "part_of", difficulty: 1 },
    { slug: "matrix-multiplication", kind: "part_of", difficulty: 2 },
    { slug: "cuda", kind: "related", difficulty: 2 },
    { slug: "memory-bandwidth", kind: "related", difficulty: 3 },
    { slug: "tensor-cores", kind: "part_of", difficulty: 4 },
  ] as const,
  // Shows canonicalization: the model says "Floating-point formats", we reuse floating-point.
  duplicate: { title: "Floating point precision formats", hook: "FP16, BF16, FP8 and why fewer bits is faster." },
};

/** Sources. Real URLs; the UI re-checks them live (oEmbed / HTTP) and shows dead ones. */
export const RESOURCES: Record<string, Resource> = {
  "neural-networks": { slug: "neural-networks", url: "https://www.youtube.com/watch?v=aircAruvnKk", kind: "video", title: "But what is a neural network?", provider: "3Blue1Brown", startSeconds: 0, demo: true },
  backpropagation: { slug: "backpropagation", url: "https://www.youtube.com/watch?v=Ilg3gGewQ5U", kind: "video", title: "What is backpropagation really doing?", provider: "3Blue1Brown", startSeconds: 0, demo: true },
  attention: { slug: "attention", url: "https://www.youtube.com/watch?v=eMlx5fFNoYc", kind: "video", title: "Attention in transformers, visually explained", provider: "3Blue1Brown", startSeconds: 0, demo: true },
  transformers: { slug: "transformers", url: "https://www.youtube.com/watch?v=wjZofJX0v4M", kind: "video", title: "But what is a GPT?", provider: "3Blue1Brown", startSeconds: 0, demo: true },
  "matrix-multiplication": { slug: "matrix-multiplication", url: "https://www.youtube.com/watch?v=XkY2DOUCWMU", kind: "video", title: "Matrix multiplication as composition", provider: "3Blue1Brown", startSeconds: 62, demo: true },
  gpu: { slug: "gpu", url: "https://www.youtube.com/watch?v=-P28LKWTzrI", kind: "video", title: "Mythbusters Demo GPU versus CPU", provider: "NVIDIA", startSeconds: 0, demo: true },
  "parallel-computing": { slug: "parallel-computing", url: "https://en.wikipedia.org/wiki/Parallel_computing", kind: "article", title: "Parallel computing", provider: "Wikipedia", demo: true },
  cuda: { slug: "cuda", url: "https://en.wikipedia.org/wiki/CUDA", kind: "article", title: "CUDA", provider: "Wikipedia", demo: true },
  "memory-bandwidth": { slug: "memory-bandwidth", url: "https://en.wikipedia.org/wiki/Memory_bandwidth", kind: "article", title: "Memory bandwidth", provider: "Wikipedia", demo: true },
  "tensor-cores": { slug: "tensor-cores", url: "https://en.wikipedia.org/wiki/Tensor_Processing_Unit", kind: "article", title: "Tensor Processing Unit", provider: "Wikipedia", demo: true },
  hbm: { slug: "hbm", url: "https://en.wikipedia.org/wiki/High_Bandwidth_Memory", kind: "article", title: "High Bandwidth Memory", provider: "Wikipedia", demo: true },
  "ai-accelerators": { slug: "ai-accelerators", url: "https://en.wikipedia.org/wiki/AI_accelerator", kind: "article", title: "AI accelerator", provider: "Wikipedia", demo: true },
  "floating-point": { slug: "floating-point", url: "https://en.wikipedia.org/wiki/Bfloat16_floating-point_format", kind: "article", title: "bfloat16 floating-point format", provider: "Wikipedia", demo: true },
  quantization: { slug: "quantization", url: "https://en.wikipedia.org/wiki/Quantization_(signal_processing)", kind: "article", title: "Quantization", provider: "Wikipedia", demo: true },
  embeddings: { slug: "embeddings", url: "https://en.wikipedia.org/wiki/Word_embedding", kind: "article", title: "Word embedding", provider: "Wikipedia", demo: true },
  "training-vs-inference": { slug: "training-vs-inference", url: "https://en.wikipedia.org/wiki/Deep_learning", kind: "article", title: "Deep learning", provider: "Wikipedia", demo: true },
  "moores-law": { slug: "moores-law", url: "https://en.wikipedia.org/wiki/Moore%27s_law", kind: "article", title: "Moore's law", provider: "Wikipedia", demo: true },
};

/** Optional Mermaid flowcharts (plan §5.3). Muse Spark generates these in production. */
export const DIAGRAMS: Record<string, string> = {
  "matrix-multiplication": `flowchart LR
  A[Input vector] --> M((Multiply by<br/>weight matrix))
  W[Weights] --> M
  M --> S[Sum each row]
  S --> O[Next layer]`,
  gpu: `flowchart LR
  T[One big task] --> SPLIT{Split into<br/>thousands}
  SPLIT --> C1[Core 1]
  SPLIT --> C2[Core 2]
  SPLIT --> C3[Core …n]
  C1 & C2 & C3 --> R[Result]`,
  "memory-bandwidth": `flowchart LR
  MEM[(Memory)] -- data per second --> CH[Compute]
  CH -- waits if pipe is narrow --> MEM`,
  attention: `flowchart LR
  Q[Query word] --> SC{Score vs<br/>every word}
  K[Keys] --> SC
  SC --> WS[Weighted sum of values]
  V[Values] --> WS`,
  "ai-accelerators": `flowchart TB
  NN[Neural net] --> MM[Mostly matrix multiply]
  MM --> HW[Hardware that only does that,<br/>very fast]`,
};

const DAY = 86_400_000;

/** A week of events for the starting map, so the time-lapse has something to replay. */
export function seedEvents(now: number): FEvent[] {
  const t0 = now - 7 * DAY;
  let id = 1;
  const ev = (d: number, slug: string, kind: FEvent["kind"], payload?: FEvent["payload"]): FEvent => ({
    id: id++,
    slug,
    kind,
    at: t0 + d * DAY,
    payload,
  });
  return [
    ev(0.1, "neural-networks", "seed"),
    ev(0.12, "neural-networks", "open"),
    ev(0.14, "neural-networks", "watch"),
    ev(0.2, "backpropagation", "seed"),
    ev(0.22, "embeddings", "seed"),
    ev(0.24, "moores-law", "seed"),
    ev(0.9, "backpropagation", "open"),
    ev(0.92, "backpropagation", "dwell"),
    ev(1.4, "moores-law", "skip"),
    ev(1.8, "neural-networks", "explain", { score: 3 }),
    ev(2.1, "transformers", "seed"),
    ev(2.15, "transformers", "open"),
    ev(2.2, "transformers", "watch"),
    ev(2.3, "attention", "seed"),
    ev(3.1, "attention", "open"),
    ev(3.12, "attention", "dwell"),
    ev(3.5, "embeddings", "open"),
    ev(4.2, "transformers", "explain", { score: 2 }),
    ev(4.25, "transformers", "session", { with: "Rhea (seed)" }),
    ev(4.3, "training-vs-inference", "seed"),
    ev(5.0, "training-vs-inference", "open"),
    ev(5.1, "floating-point", "seed"),
    ev(5.12, "quantization", "seed"),
    ev(5.6, "quantization", "skip"),
    ev(6.2, "neural-networks", "open"),
    ev(6.3, "training-vs-inference", "dwell"),
    ev(6.8, "attention", "watch"),
  ];
}

export function seedNodes(events: FEvent[]): Record<string, UserNode> {
  return replay(events);
}

/** Seed explorers. ALWAYS labeled as seed/demo in the UI (plan §9). */
export function seedExplorers(now: number): Explorer[] {
  const min = 60_000;
  return [
    { id: "amit", name: "Amit", demo: true, activeConcepts: ["cuda", "memory-bandwidth", "gpu", "hbm", "parallel-computing"], mastery: { "memory-bandwidth": 0.82, gpu: 0.7, hbm: 0.6, cuda: 0.5, "matrix-multiplication": 0.15 }, openToMatch: true, language: "en", lastActive: now - 1 * min, color: "#3aa0ff" },
    { id: "seed-rhea", name: "Rhea", demo: true, activeConcepts: ["attention", "transformers", "embeddings"], mastery: { attention: 0.8, transformers: 0.9 }, openToMatch: true, language: "en", lastActive: now - 4 * min, color: "#c86bff" },
    { id: "seed-kofi", name: "Kofi", demo: true, activeConcepts: ["quantization", "floating-point"], mastery: { quantization: 0.75 }, openToMatch: true, language: "en", lastActive: now - 7 * min, color: "#3ddc84" },
    { id: "seed-lena", name: "Lena", demo: true, activeConcepts: ["tpu", "systolic-arrays", "matrix-multiplication"], mastery: { "systolic-arrays": 0.7 }, openToMatch: false, language: "en", lastActive: now - 2 * min, color: "#f5c542" },
    { id: "seed-yuki", name: "Yuki", demo: true, activeConcepts: ["chip-fabrication", "moores-law"], mastery: { "chip-fabrication": 0.65 }, openToMatch: true, language: "ja", lastActive: now - 12 * min, color: "#ff5d73" },
  ];
}

export const DEMO_PROFILE: Profile = {
  displayName: "Sirpreet",
  staticProfile: { role: "Product designer", background: "Design + frontend, new to ML hardware", age18Plus: true },
  preferences: { style: "Visual first, then explain it back", pace: "Short bursts, 10–15 min", inferred: true },
  currentIntent: "Understand why AI needs special chips before the hackathon demo",
  openToMatch: true,
  language: "en",
};

/** Canned explain-back transcript (demo only). */
export const DEMO_EXPLAIN_TRANSCRIPT =
  "Each layer takes a list of numbers and multiplies it by a big grid of weights. Every output is a sum of inputs times weights, and a GPU can do all those sums at the same time.";
