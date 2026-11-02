import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateTopicEdges, layoutSummary, YOU } from "../lib/graph-layout.ts";
import type { Edge } from "../lib/types.ts";

test("topic links preserve real cross-group relationships without duplicate or internal edges", () => {
  const groups = [{ id: "hardware", conceptSlugs: ["gpu", "memory"] }, { id: "math", conceptSlugs: ["matrix"] }, { id: "cooking", conceptSlugs: ["yeast"] }];
  const edges: Edge[] = [
    { src: "gpu", dst: "memory", kind: "part_of" },
    { src: "gpu", dst: "matrix", kind: "prerequisite" },
    { src: "gpu", dst: "matrix", kind: "prerequisite" },
    { src: "memory", dst: "matrix", kind: "related" },
    { src: "unknown", dst: "gpu", kind: "related" },
  ];
  const links = aggregateTopicEdges(groups, edges);
  assert.equal(links.length, 1);
  assert.equal(links[0].src, "hardware"); assert.equal(links[0].dst, "math");
  assert.equal(links[0].count, 2);
  assert.deepEqual(new Set(links[0].kinds), new Set(["prerequisite", "related"]));
  assert.deepEqual(aggregateTopicEdges(groups, []), []);
});

test("topic overview layout is stable, finite and separated for long labels and empty maps", () => {
  assert.deepEqual(layoutSummary([]).pos, {});
  const topics = Array.from({ length: 12 }, (_, index) => ({ id: `topic-${index}`, title: `${index}: A longer conceptual area across several learning questions`, conceptCount: index + 1 }));
  const first = layoutSummary(topics), second = layoutSummary(topics);
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first.pos).sort(), topics.map(topic => topic.id).sort());
  const positions = Object.values(first.pos);
  for (const box of positions) {
    assert.ok([box.x, box.y, box.w, box.h].every(Number.isFinite));
    assert.ok(box.w > 0 && box.h > 0);
  }
  for (let index = 0; index < positions.length; index++) for (let other = index + 1; other < positions.length; other++) {
    const a = positions[index], b = positions[other];
    assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2, `overlapping topic cards ${index} and ${other}`);
  }
});

test("three-topic phone overview stays readable within compact bounds and clear of the learner hub", () => {
  const topics = [
    { id: "hardware", title: "AI hardware and graphics processors", conceptCount: 8 },
    { id: "language", title: "Language models and contextual learning", conceptCount: 12 },
    { id: "fermentation", title: "Fermentation and the science of bread", conceptCount: 5 },
  ];
  const compact = layoutSummary(topics, { compact: true });
  assert.deepEqual(compact, layoutSummary(topics, { compact: true }));
  assert.deepEqual(Object.keys(compact.pos).sort(), topics.map(topic => topic.id).sort());
  const cards = Object.values(compact.pos);
  for (const card of cards) {
    assert.ok([card.x, card.y, card.w, card.h].every(Number.isFinite));
    assert.ok(card.w > 0 && card.h > 0);
  }
  const width = Math.max(...cards.map(card => card.x + card.w / 2)) - Math.min(...cards.map(card => card.x - card.w / 2));
  const height = Math.max(...cards.map(card => card.y + card.h / 2)) - Math.min(...cards.map(card => card.y - card.h / 2));
  assert.ok(width <= 280, `phone overview is too wide: ${width}`);
  assert.ok(height <= 430, `phone overview is too tall: ${height}`);
  const boxes = [...cards, { x: 0, y: 0, ...YOU }];
  for (let index = 0; index < boxes.length; index++) for (let other = index + 1; other < boxes.length; other++) {
    const a = boxes[index], b = boxes[other];
    assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2, `compact cards or learner hub overlap: ${index} and ${other}`);
  }
});
