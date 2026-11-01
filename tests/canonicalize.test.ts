import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalize } from "../lib/canonicalize.ts";

const graph = [
  { slug: "gpu", title: "GPUs" },
  { slug: "matrix-multiplication", title: "Matrix multiplication" },
  { slug: "floating-point", title: "Floating point precision" },
  { slug: "hbm", title: "HBM memory" },
];

test("alias with plural resolves to the canonical concept (regression)", () => {
  const hit = canonicalize("graphics processing unit", graph);
  assert.equal(hit?.slug, "gpu");
});

test("graphics processors reuse gpu instead of minting a duplicate", () => {
  const hit = canonicalize("Graphics processors", graph);
  assert.equal(hit?.slug, "gpu");
});

test("matmul alias resolves", () => {
  assert.equal(canonicalize("matmul", graph)?.slug, "matrix-multiplication");
});

test("unrelated title does not force a match", () => {
  assert.equal(canonicalize("photosynthesis in plants", graph), null);
});
