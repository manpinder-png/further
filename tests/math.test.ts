import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEvent, decayInterest, replay } from "../lib/math.ts";

test("interest halves after the 3-day half-life", () => {
  assert.equal(decayInterest(0.8, 72 * 3_600_000), 0.4);
});

test("watch upgrades mastery by 0.2 and state to explored", () => {
  const n = applyEvent(undefined, { id: 1, slug: "gpu", kind: "watch", at: 0 });
  assert.equal(n.mastery, 0.2);
  assert.equal(n.state, "explored");
});

test("explain-back 3/3 reaches understood", () => {
  let n = applyEvent(undefined, { id: 1, slug: "gpu", kind: "watch", at: 0 });
  n = applyEvent(n, { id: 2, slug: "gpu", kind: "explain", payload: { score: 3 }, at: 1000 });
  assert.equal(n.mastery, 0.7);
  assert.equal(n.state, "understood");
});

test("replay stops at `until`", () => {
  const nodes = replay(
    [
      { id: 1, slug: "a", kind: "seed", at: 0 },
      { id: 2, slug: "b", kind: "seed", at: 100 },
    ],
    50,
  );
  assert.ok(nodes.a);
  assert.equal(nodes.b, undefined);
});

test("skip drops interest and never raises mastery", () => {
  const n = applyEvent(undefined, { id: 1, slug: "gpu", kind: "skip", at: 0 });
  assert.equal(n.mastery, 0);
  assert.ok(n.interest < 0.5);
});
