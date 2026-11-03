import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import picomatch from "next/dist/compiled/picomatch/index.js";
import config from "../next.config.ts";

const exclusions = config.outputFileTracingExcludes?.["/*"];
if (!exclusions?.length) throw new Error("Private runtime build-trace exclusions are missing.");
const normalize = value => value.replaceAll("\\", "/");
// Next 15 joins exclusion globs with native separators, which picomatch treats
// as escapes on Windows. Apply the same exclusions with normalized paths.
const excluded = picomatch(exclusions.map(pattern => normalize(resolve(pattern))), { dot: true, nocase: process.platform === "win32" });
let changed = 0;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (entry.name.endsWith(".nft.json")) {
      const trace = JSON.parse(await readFile(file, "utf8"));
      const files = trace.files.filter(asset => !excluded(normalize(resolve(dirname(file), normalize(asset)))));
      if (files.length !== trace.files.length) {
        await writeFile(file, JSON.stringify({ ...trace, files }));
        changed++;
      }
    }
  }
}
await scan(".next");
console.log(`Applied private runtime exclusions to ${changed} build manifests.`);
