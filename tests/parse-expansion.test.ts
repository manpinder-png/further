import { test } from "node:test";
import assert from "node:assert/strict";
import { parseModelPayload } from "../lib/parse-expansion.ts";

test("parses a plain JSON line", () => {
  assert.equal(parseModelPayload('{"slug":"gpu","title":"GPUs"}').length, 1);
});

test("parses a fenced line", () => {
  assert.equal(parseModelPayload('```json\n{"slug":"gpu"}').length, 1);
});

test("parses a JSON array of nodes", () => {
  assert.equal(parseModelPayload('[{"slug":"gpu"},{"slug":"cuda"}]').length, 2);
});

test("parses nodes nested under concepts", () => {
  assert.equal(parseModelPayload('{"concepts":[{"slug":"gpu"}]}').length, 1);
});

test("garbage yields nothing, never throws", () => {
  assert.deepEqual(parseModelPayload("not json at all"), []);
});
