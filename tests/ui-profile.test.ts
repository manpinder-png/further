import test from "node:test";
import assert from "node:assert/strict";
import { writableProfile } from "../domains/ui/contracts.ts";

test("profile edits strip server identity, revision and unknown nested fields", () => {
  const serverProfile = {
    id: "server-owned-actor", revision: 42, secret: "not-a-writable-field",
    displayName: "Learner", language: "en", openToMatch: true, availableMinutes: 20, currentIntent: "Learn GPU memory",
    staticProfile: { role: "Developer", background: "Python", age18Plus: true, unauthorized: true },
    preferences: { style: "visual", pace: "short", inferred: false, unauthorized: true },
  };
  assert.deepEqual(writableProfile(serverProfile), {
    displayName: "Learner", language: "en", openToMatch: true, availableMinutes: 20, currentIntent: "Learn GPU memory",
    staticProfile: { role: "Developer", background: "Python", age18Plus: true },
    preferences: { style: "visual", pace: "short", inferred: false },
  });
});
