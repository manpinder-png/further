import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("Geomind leaves empty neighborhoods unobstructed while preserving refresh and operational notices", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", `
    const assert = require("node:assert/strict");
    const React = require("react");
    const { renderToStaticMarkup } = require("react-dom/server");
    const GeomindMap = require("./components/map/GeomindMap.tsx").default;
    const snapshot = {
      version: 1, generatedAt: 1, mode: "available-now",
      viewer: { discoveryEnabled: true, adultConfirmed: true },
      scope: { kind: "all-topics", conceptSlugs: [] },
      neighbors: [], limit: 24, hasMore: false, emptyReason: "no-neighbors",
    };
    const render = (props = {}) => renderToStaticMarkup(React.createElement(GeomindMap, {
      snapshot, loading: false, error: null, selectedId: null,
      onSelect() {}, onRefresh() {}, sample: false, ...props,
    }));
    const empty = render();
    assert.ok(empty.includes(">Refresh</button>"));
    assert.ok(empty.includes("Here in ideas"));
    assert.ok(!empty.includes("No one nearby in ideas right now"));
    assert.ok(!empty.includes("This neighborhood shows willing learners"));
    assert.ok(!empty.includes(">Check again</button>"));
    assert.ok(render({ snapshot: null, loading: true }).includes("Finding nearby ideas"));
    assert.ok(render({ error: "Neighborhood request failed." }).includes("Neighborhood request failed."));
    assert.ok(render({ inviteError: "Invitation failed." }).includes('role="alert"'));
    assert.ok(render({ snapshot: { ...snapshot, emptyReason: "discovery-off" } }).includes("Choose your availability"));
    assert.ok(render({ snapshot: { ...snapshot, emptyReason: "indexing" } }).includes("Your ideas are finding their place"));
  `], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
