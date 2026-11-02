import { test } from "node:test";
import assert from "node:assert/strict";
import { childConceptHierarchy, conceptHierarchy, hierarchyPathKey, narrowsBranch } from "../lib/knowledge-hierarchy.ts";
import type { Concept, Edge } from "../lib/types.ts";
const concepts = ["computing","hardware","gpu","memory","biology"].map(slug => ({slug,title:slug,hook:`Explore ${slug}`,domain:"general"} satisfies Concept));
const edges: Edge[] = [
  {src:"computing",dst:"hardware",kind:"part_of"},
  {src:"hardware",dst:"gpu",kind:"part_of"},
  {src:"gpu",dst:"memory",kind:"part_of"},
];

test("saved part-of relationships support repeated drill-in rather than one flat topic level", () => {
  const roots = conceptHierarchy(concepts,edges,concepts.map(concept => concept.slug));
  assert.deepEqual(roots.map(group => group.anchorSlug),["biology","computing"]);
  const computing = roots.find(group => group.anchorSlug === "computing")!;
  const hardware = childConceptHierarchy(concepts,edges,computing)[0];
  assert.equal(hardware.anchorSlug,"hardware");
  const gpu = childConceptHierarchy(concepts,edges,hardware,["computing"])[0];
  const memory = childConceptHierarchy(concepts,edges,gpu,["computing","hardware"])[0];
  assert.equal(gpu.anchorSlug,"gpu"); assert.equal(memory.anchorSlug,"memory");
  assert.deepEqual(memory.conceptSlugs,["memory"]);
  assert.equal(hierarchyPathKey([computing,hardware,gpu]),"concept-computing/concept-hardware/concept-gpu");
});

test("a concept can be reached through two parents without copying its canonical identity", () => {
  const graph: Edge[] = [{src:"computing",dst:"gpu",kind:"part_of"},{src:"hardware",dst:"gpu",kind:"part_of"}];
  const roots = conceptHierarchy(concepts,graph,["computing","hardware","gpu"]);
  assert.equal(roots.length,2);
  assert.deepEqual(roots.flatMap(group => childConceptHierarchy(concepts,graph,group).map(child => child.anchorSlug)),["gpu","gpu"]);
});

test("legacy cycles, self edges and out-of-scope edges remain finite and never hide concepts", () => {
  const graph: Edge[] = [...edges,{src:"memory",dst:"computing",kind:"part_of"},{src:"gpu",dst:"gpu",kind:"part_of"},{src:"biology",dst:"private-topic",kind:"part_of"}];
  const first = conceptHierarchy(concepts,graph,concepts.map(concept => concept.slug));
  assert.deepEqual(new Set(first.flatMap(group => group.conceptSlugs)),new Set(concepts.map(concept => concept.slug)));
  let frontier = first, levels = 0; const visited = new Set<string>();
  while(frontier.length && levels++ < 20) {
    const next = [];
    for(const group of frontier) { if(visited.has(group.anchorSlug!)) continue; visited.add(group.anchorSlug!); next.push(...childConceptHierarchy(concepts,graph,group,[...visited])); }
    frontier=next;
  }
  assert.ok(levels<20);
  assert.equal(first.some(group => group.conceptSlugs.includes("private-topic")),false);
});

test("a semantic branch must narrow and exactly cover its parent", () => {
  const group = (id:string,slugs:string[]) => ({id,title:id,summary:id,conceptSlugs:slugs});
  assert.equal(narrowsBranch([group("all",["a","b"])],["a","b"]),false);
  assert.equal(narrowsBranch([group("first",["a"]),group("second",["b"])],["a","b"]),true);
  assert.equal(narrowsBranch([group("first",["a"]),group("second",["a"])],["a","b"]),false);
  assert.equal(narrowsBranch([group("first",["a"]),group("second",["c"])],["a","b"]),false);
});
