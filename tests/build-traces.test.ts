import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("build trace exclusions remove private runtime assets with either separator while retaining application assets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "further-build-traces-"));
  try {
    const folder = join(directory, ".next", "server");
    await mkdir(folder, { recursive: true });
    const file = join(folder, "route.js.nft.json");
    const application = "../../domains/data/migrations/005_learning_map_reset.sql";
    await writeFile(file, JSON.stringify({ version: 1, files: [
      "../../.local/data/pglite/PG_VERSION",
      "..\\..\\.local\\session-secret",
      "../../.env.local",
      "../../.venv/lib/package.py",
      "../../test-results/capture.png",
      application,
    ] }));
    const result = spawnSync(process.execPath, [resolve("scripts/exclude-private-traces.mjs")], { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { version: 1, files: [application] });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
