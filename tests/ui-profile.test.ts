import test from "node:test";
import assert from "node:assert/strict";
import { writableProfile } from "../domains/ui/contracts.ts";
import { resetLearningMap, setExpectedActor } from "../lib/client/live.ts";

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

test("map reset transport retains one confirmed request key across retries and surfaces failed resets", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ body: unknown; headers: Headers }> = [];
  setExpectedActor("signed-in-learner");
  try {
    globalThis.fetch = async (_input, init) => {
      requests.push({ body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
      return requests.length === 1 ? Response.json({ error: "Wait for your guide to finish." }, { status: 409 }) : Response.json({ ok: true });
    };
    await assert.rejects(resetLearningMap("same-reset-key"), /Wait for your guide/);
    assert.deepEqual(await resetLearningMap("same-reset-key"), { ok: true });
    assert.deepEqual(requests.map(request => request.body), [
      { confirmation: "RESET", idempotencyKey: "same-reset-key" },
      { confirmation: "RESET", idempotencyKey: "same-reset-key" },
    ]);
    for (const request of requests) {
      assert.equal(request.headers.get("idempotency-key"), "same-reset-key");
      assert.equal(request.headers.get("x-further-actor"), "signed-in-learner");
    }
  } finally { globalThis.fetch = originalFetch; setExpectedActor(null); }
});
