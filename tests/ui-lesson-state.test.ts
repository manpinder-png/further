import { test } from "node:test";
import assert from "node:assert/strict";
import { lessonPracticeSaved } from "../lib/client/lesson-state.ts";
import type { FEvent } from "../lib/types.ts";

test("a regenerated lesson retains its practice until that exact lesson is completed", () => {
  const events: FEvent[] = [
    { id: 1, slug: "gpu", kind: "watch", payload: { depth: 1 }, at: 1 },
    { id: 2, slug: "gpu", kind: "watch", payload: { depth: 1, lessonRunId: "old-lesson" }, at: 2 },
  ];
  assert.equal(lessonPracticeSaved("gpu", "old-lesson", events), true);
  assert.equal(lessonPracticeSaved("gpu", "replacement-lesson", events), false);
  events.push({ id: 3, slug: "gpu", kind: "watch", payload: { depth: 1, lessonRunId: "replacement-lesson" }, at: 3 });
  assert.equal(lessonPracticeSaved("gpu", "replacement-lesson", events), true);
});

test("practice completion does not cross topic, event kind or missing lesson identity", () => {
  const events: FEvent[] = [
    { id: 1, slug: "gpu", kind: "watch", payload: { lessonRunId: "lesson" }, at: 1 },
    { id: 2, slug: "gpu", kind: "skip", payload: { lessonRunId: "skipped-lesson" }, at: 2 },
  ];
  assert.equal(lessonPracticeSaved("cpu", "lesson", events), false);
  assert.equal(lessonPracticeSaved("gpu", "skipped-lesson", events), false);
  assert.equal(lessonPracticeSaved("gpu", undefined, events), false);
});
