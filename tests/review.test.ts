import { test } from "node:test";
import assert from "node:assert/strict";
import { COMPLETE_SCORE, SCORE_LABEL, explanationAttempts, practicePrompt, resumePoints, slippingConcepts, weeklyRecap } from "../lib/review.ts";
import type { Concept, FEvent, UserNode } from "../lib/types.ts";

const DAY = 86_400_000;
const now = 20 * DAY;
const concepts = Object.fromEntries(["a", "b", "c", "d"].map((slug) => [slug, { slug, title: slug.toUpperCase(), hook: "", domain: "general" }])) as Record<string, Concept>;
let id = 0;
const ev = (slug: string, kind: FEvent["kind"], at: number, payload?: Record<string, unknown>): FEvent => ({ id: ++id, slug, kind, at, payload });
const node = (slug: string, state: UserNode["state"], lastTouched: number): UserNode => ({ slug, state, interest: 0.5, mastery: state === "understood" ? 1 : 0, lastTouched });

test("slipping lists explained concepts left untouched, longest first", () => {
  const events = [ev("a", "explain", now - 10 * DAY, { score: 3 }), ev("b", "explain", now - 6 * DAY, { score: 2 }), ev("c", "explain", now - DAY, { score: 3 }), ev("d", "open", now - 9 * DAY)];
  const nodes = { a: node("a", "understood", now - 10 * DAY), b: node("b", "understood", now - 6 * DAY), c: node("c", "understood", now - DAY), d: node("d", "explored", now - 9 * DAY) };
  const slipping = slippingConcepts(nodes, events, concepts, now);
  assert.deepEqual(slipping.map((item) => [item.slug, item.daysSince]), [["a", 10], ["b", 6]]);
});

test("weekly recap counts distinct concepts per window and compares with the previous week", () => {
  const events = [ev("a", "seed", now - DAY), ev("b", "seed", now - 2 * DAY), ev("a", "open", now - DAY), ev("a", "open", now - DAY + 1000), ev("a", "explain", now - DAY, { score: 2 }), ev("c", "seed", now - 9 * DAY), ev("c", "explain", now - 8 * DAY, { score: 3 }), ev("c", "session", now - 8 * DAY, { with: "peer", sessionId: "s1" }), ev("d", "session", now - 8 * DAY, { with: "peer", sessionId: "s1" })];
  const recap = weeklyRecap(events, now);
  assert.deepEqual(recap.thisWeek, { added: 2, opened: 1, explained: 1, sourcesRead: 0, sessions: 0 });
  assert.deepEqual(recap.lastWeek, { added: 1, opened: 0, explained: 1, sourcesRead: 0, sessions: 1 });
});

test("resume points skip finished questions and pick up the most recently touched unfinished concept", () => {
  const events = [ev("a", "explain", now - DAY, { score: 3 }), ev("c", "explain", now - 3 * DAY, { score: 3 }), ev("d", "explain", now - 3 * DAY, { score: 3 })];
  const nodes = { a: node("a", "understood", now - DAY), b: node("b", "explored", now - 2 * DAY), c: node("c", "understood", now - 3 * DAY), d: node("d", "understood", now - 3 * DAY) };
  const paths = [
    { key: "q1", question: "First?", slugs: ["a", "b"], at: now - 5 * DAY },
    { key: "q2", question: "Done?", slugs: ["c", "d"], at: now - 4 * DAY },
    { key: "saved-topics", question: "Saved topics", slugs: ["a"], at: 0 },
  ];
  const points = resumePoints(paths, nodes, events, concepts);
  assert.equal(points.length, 1);
  assert.equal(points[0].key, "q1");
  assert.equal(points[0].nextSlug, "b");
  assert.deepEqual([points[0].opened, points[0].explained, points[0].total], [2, 1, 2]);
});

test("explanation attempts are returned oldest first with their feedback", () => {
  const attempts = explanationAttempts("a", [ev("a", "explain", 300, { score: 3, feedback: "Clear." }), ev("a", "explain", 100, { score: 1, feedback: "Add an example." }), ev("a", "open", 200), ev("b", "explain", 150, { score: 2 })]);
  assert.deepEqual(attempts.map((attempt) => [attempt.at, attempt.score, attempt.feedback]), [[100, 1, "Add an example."], [300, 3, "Clear."]]);
});

test("explanation attempts keep the question answered and the follow-up question", () => {
  const [attempt] = explanationAttempts("a", [ev("a", "explain", 100, { score: 2, feedback: "Good mechanism.", prompt: "How does it work?", nextPrompt: "Why does it fail when inputs double?", runId: "run-1" })]);
  assert.equal(attempt.prompt, "How does it work?");
  assert.equal(attempt.nextPrompt, "Why does it fail when inputs double?");
  assert.equal(attempt.runId, "run-1");
});

test("practice prompts climb the rubric: first ask, then how, then why, then transfer", () => {
  assert.match(practicePrompt("Attention", null), /to a friend/);
  assert.match(practicePrompt("Attention", 1), /step by step/);
  assert.match(practicePrompt("Attention", 2), /why/);
  assert.match(practicePrompt("Attention", 3), /situation you haven't used/);
  assert.equal(SCORE_LABEL[COMPLETE_SCORE], "Explains how and why");
});
