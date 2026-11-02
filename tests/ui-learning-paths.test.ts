import { test } from "node:test";
import assert from "node:assert/strict";
import { learningPaths, orderPath } from "../lib/client/learning-paths.ts";
import type { Mission } from "../domains/ui/contracts.ts";
import type { Concept } from "../lib/types.ts";

const concepts = Object.fromEntries(["context", "tokens", "batteries", "voltage", "old"].map((slug) => [slug, { slug, title: slug, hook: slug, domain: "general" }])) as Record<string, Concept>;
const mission = (id: number, text: string, slugs: string[]): Mission => ({ id, text, slugs, at: id, status: "done", source: "text", added: slugs.length, reused: 0 });

test("new questions have independent topic views while older topics remain recoverable", () => {
  const paths = learningPaths([mission(2, "How do batteries work?", ["batteries", "voltage"]), mission(1, "How do chats remember?", ["context", "tokens"])], concepts);
  assert.deepEqual(paths[0].slugs, ["batteries", "voltage"]);
  assert.deepEqual(paths[1].slugs, ["context", "tokens"]);
  assert.deepEqual(paths[2].slugs, ["old"]);
  assert.equal(paths[2].key, "saved-topics");
});

test("a shared concept may belong to two questions without merging their paths", () => {
  const paths = learningPaths([mission(2, "Token limits", ["tokens"]), mission(1, "Chat memory", ["context", "tokens"])], concepts);
  assert.deepEqual(paths[0].slugs, ["tokens"]);
  assert.deepEqual(paths[1].slugs, ["context", "tokens"]);
});

test("unfinished and missing concepts do not become steps; prerequisite cycles stay bounded", () => {
  const pending = { ...mission(3, "Still writing", ["context"]), status: "running" as const };
  assert.equal(learningPaths([pending, mission(1, "Question", ["context", "missing", "context"])], concepts)[0].slugs.length, 1);
  assert.deepEqual(orderPath(["context", "tokens"], [{ src: "tokens", dst: "context", kind: "prerequisite" }]), ["tokens", "context"]);
  assert.deepEqual(orderPath(["context", "tokens"], [{ src: "tokens", dst: "context", kind: "prerequisite" }, { src: "context", dst: "tokens", kind: "prerequisite" }]), ["context", "tokens"]);
});
