import { test } from "node:test";
import assert from "node:assert/strict";
import { learnerModel } from "../lib/learn.ts";

const node = (slug: string, mastery: number, interest = 0.8, state = "explored") => ({
  slug, mastery, interest, state: state as never, lastTouched: 1000,
});

test("strengths and frontier are derived from the map", () => {
  const m = learnerModel(
    { gpu: node("gpu", 0.8, 0.8, "understood"), cuda: node("cuda", 0, 0.9, "seeded") },
    [],
    1000,
  );
  assert.deepEqual(m.strengths, ["gpu"]);
  assert.deepEqual(m.frontier, ["cuda"]);
});

test("finished formats become Muse's preferred formats; skipped ones sink", () => {
  const m = learnerModel(
    { gpu: node("gpu", 0.8) },
    [
      { id: 1, slug: "gpu", kind: "watch", payload: { format: "manipulate" }, at: 0 },
      { id: 2, slug: "gpu", kind: "watch", payload: { format: "manipulate" }, at: 1 },
      { id: 3, slug: "gpu", kind: "skip", payload: { format: "short-read" }, at: 2 },
    ],
    1000,
  );
  assert.equal(m.bestFormats[0], "manipulate");
  assert.match(m.summary, /manipulate finished 2/);
});

test("strong explain-backs make Muse pitch deeper", () => {
  const m = learnerModel(
    { gpu: node("gpu", 0.8) },
    [
      { id: 1, slug: "gpu", kind: "explain", payload: { score: 3 }, at: 0 },
      { id: 2, slug: "gpu", kind: "explain", payload: { score: 3 }, at: 1 },
    ],
    1000,
  );
  assert.equal(m.style, "explain-back");
  assert.match(m.summary, /deeper/);
});
