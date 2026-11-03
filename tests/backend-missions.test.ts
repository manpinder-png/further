import { test } from "node:test";
import assert from "node:assert/strict";
import { missionsFromRuns, type SavedExpansionRun } from "../domains/backend/missions.ts";

const run = (id: string, text: string, slugs: string[], extra: Record<string, unknown> = {}, status = "succeeded"): SavedExpansionRun => ({
  id, agentId: "knowledge-map", status, error: null, createdAt: Number(id.slice(-1)),
  input: { text, objective: "expand", ...extra },
  output: { data: { intent: text, root: slugs[0] ?? "root", rootTitle: text, explanation: "x", concepts: slugs.map(slug => ({ slug, title: slug, hook: "hook", difficulty: 0.3 })) } },
});

test("a go-deeper run grows its parent question's path instead of becoming a new question", () => {
  const missions = missionsFromRuns([
    run("aaaaaaaa-0000-0000-0000-000000000001", "What is AI?", ["ai", "ml-basics", "examples"]),
    run("aaaaaaaa-0000-0000-0000-000000000002", "Go deeper: ML basics", ["ml-basics", "gradient-descent", "loss-functions"], { extendsRunId: "aaaaaaaa-0000-0000-0000-000000000001", focus: { slug: "ml-basics", title: "ML basics", siblings: ["ai", "examples"] } }),
  ]);
  assert.equal(missions.length, 1);
  assert.deepEqual(missions[0].slugs, ["ai", "ml-basics", "examples", "gradient-descent", "loss-functions"]);
  assert.equal(missions[0].added, 5);
  assert.equal(missions[0].text, "What is AI?");
});

test("failed or in-flight deeper runs do not change the parent, and orphans stay visible", () => {
  const parent = "aaaaaaaa-0000-0000-0000-000000000001";
  const missions = missionsFromRuns([
    run(parent, "What is AI?", ["ai"]),
    run("aaaaaaaa-0000-0000-0000-000000000003", "Go deeper: AI", ["ai", "agents"], { extendsRunId: parent }, "failed"),
    run("aaaaaaaa-0000-0000-0000-000000000004", "Go deeper: AI", ["ai", "search"], { extendsRunId: parent }, "running"),
    run("aaaaaaaa-0000-0000-0000-000000000005", "Go deeper: something deleted", ["orphan-concept"], { extendsRunId: "aaaaaaaa-0000-0000-0000-00000000dead" }),
  ]);
  assert.equal(missions.length, 2);
  assert.deepEqual(missions[0].slugs, ["ai"]);
  assert.equal(missions[1].text, "Go deeper: something deleted");
  assert.deepEqual(missions[1].slugs, ["orphan-concept"]);
});

test("non-expand knowledge-map runs are not questions", () => {
  const missions = missionsFromRuns([run("aaaaaaaa-0000-0000-0000-000000000006", "overview", ["ai"], { objective: "summarize" })]);
  assert.equal(missions.length, 0);
});
