import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePair, MATCH_THRESHOLD } from "../lib/matching.ts";

const edges = [
  { src: "cuda", dst: "memory-bandwidth", kind: "related" as const },
  { src: "gpu", dst: "cuda", kind: "part_of" as const },
];
const now = 1_000_000;
const base = { demo: true, color: "#fff", language: "en", openToMatch: true, lastActive: now };

test("complementary pair clears the threshold with a teach concept", () => {
  const a = { ...base, id: "a", name: "A", activeConcepts: ["cuda", "gpu"], mastery: { "matrix-multiplication": 0.1 } };
  const b = { ...base, id: "b", name: "B", activeConcepts: ["cuda", "memory-bandwidth"], mastery: { "memory-bandwidth": 0.82, cuda: 0.5 } };
  const s = scorePair({ a, b, edges, now });
  assert.ok(s.score >= MATCH_THRESHOLD, `score ${s.score}`);
  assert.ok(s.teach);
});

test("closed-to-match explorer is filtered", () => {
  const a = { ...base, id: "a", name: "A", activeConcepts: ["cuda"], mastery: {}, openToMatch: false };
  const b = { ...base, id: "b", name: "B", activeConcepts: ["cuda"], mastery: {} };
  assert.equal(scorePair({ a, b, edges, now }).filteredBy, "not open to match");
});

test("blocked pair is filtered", () => {
  const a = { ...base, id: "a", name: "A", activeConcepts: ["cuda"], mastery: {} };
  const b = { ...base, id: "b", name: "B", activeConcepts: ["cuda"], mastery: {} };
  assert.equal(scorePair({ a, b, edges, now, blocked: true }).filteredBy, "blocked");
});

test("stale explorer loses recency", () => {
  const a = { ...base, id: "a", name: "A", activeConcepts: ["cuda"], mastery: {}, lastActive: now - 60 * 60_000 };
  const b = { ...base, id: "b", name: "B", activeConcepts: ["cuda"], mastery: {} };
  assert.equal(scorePair({ a, b, edges, now }).recency, 0);
});
