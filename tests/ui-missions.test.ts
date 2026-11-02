import test from "node:test";
import assert from "node:assert/strict";
import { mergeMissions, type Mission } from "../domains/ui/contracts.ts";

const mission = (changes: Partial<Mission>): Mission => ({
  id: 1, text: "Understand GPU memory", source: "text", at: 100_000,
  status: "running", added: 0, reused: 0, ...changes,
});

test("cold rehydration restores completed quest history and stable server run identity", () => {
  const saved = mission({ id: 8245, runId: "saved-run", source: "agent", status: "done", added: 2, slugs: ["gpu", "memory"] });
  assert.deepEqual(mergeMissions([], [saved]), [saved]);
  assert.deepEqual(mergeMissions([saved], [saved]), [saved]);
});

test("saved quests replace matching running/error placeholders without losing unrelated work", () => {
  const running = mission({ id: 1 });
  const failed = mission({ id: 2, text: "Explore compilers", status: "error", at: 110_000, error: "Connection interrupted" });
  const unrelated = mission({ id: 3, text: "Learn computer vision", at: 120_000 });
  const oldFailure = mission({ id: 4, status: "error", at: 20_000 });
  const saved = [mission({ id: 20, runId: "run-a", source: "agent", status: "done", at: 101_000 }), mission({ id: 21, runId: "run-b", source: "agent", text: failed.text, status: "done", at: 111_000 })];
  const current = [running, failed, unrelated, oldFailure];
  assert.deepEqual(mergeMissions(current, saved).map((entry) => entry.id), [3, 21, 20, 4]);
  assert.equal(current.length, 4, "merging must not mutate current state");
  assert.equal(saved.length, 2, "merging must not mutate the server snapshot");
});

test("one saved run replaces only its nearest placeholder for a repeated question", () => {
  const earlier = mission({ id: 1, at: 100_000 });
  const nearer = mission({ id: 2, at: 105_000 });
  const saved = mission({ id: 3, runId: "run", source: "agent", status: "done", at: 106_000 });
  assert.deepEqual(mergeMissions([earlier, nearer], [saved]).map((entry) => entry.id), [3, 1]);
});

test("the server owns completed history and only replaces placeholders within sixty seconds", () => {
  const completed = mission({ id: 1, status: "done" });
  const previousSaved = mission({ id: 2, runId: "old-server-run", status: "done" });
  const boundary = mission({ id: 3, status: "error", at: 40_000 });
  const saved = mission({ id: 4, runId: "new-run", source: "agent", status: "done", at: 100_000 });
  assert.deepEqual(mergeMissions([completed, previousSaved, boundary], [saved]).map((entry) => entry.id), [4, 3]);
});
