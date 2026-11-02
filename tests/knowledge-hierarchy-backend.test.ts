import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepository } from "../domains/data/repository.ts";
import type { FurtherRepository } from "../domains/data/contracts.ts";
import { generateKnowledgeOverview, getKnowledgeOverview, knowledgeGraphSignature, knowledgeOverviewSource, overviewBatches } from "../domains/backend/knowledge-overview.ts";

const shared = globalThis as typeof globalThis & {__furtherLocalRepository?:Promise<FurtherRepository>};

test("large maps use bounded summary requests and restore a durable complete hierarchy after restart", async () => {
  const directory = await mkdtemp(join(tmpdir(),"further-hierarchy-")), savedMode = process.env.FURTHER_MODEL_MODE;
  process.env.FURTHER_MODEL_MODE="fixture";
  let repo = await createRepository({dataDir:directory}); shared.__furtherLocalRepository=Promise.resolve(repo);
  try {
    const actor=randomUUID(); await repo.ensureUser(actor,"Hierarchy learner");
    const concepts=Array.from({length:250},(_,i)=>({slug:`concept-${String(i).padStart(3,"0")}`,title:`Concept ${i}`,hook:`Meaning of saved idea ${i}`,domain:"general"}));
    await repo.addConcepts(actor,concepts,concepts.slice(1).map((concept,index)=>({src:concepts[index].slug,dst:concept.slug,kind:"part_of" as const})));
    const original=await repo.getSnapshot(actor), initial=await getKnowledgeOverview(repo,actor);
    assert.equal(initial.status,"missing");
    const batches=overviewBatches(original);
    assert.ok(batches.length>1); assert.ok(batches.every(batch=>batch.concepts.length<=120 && batch.edges.length<=800));
    assert.deepEqual(new Set(batches.flatMap(batch=>batch.concepts.map(concept=>concept.slug))),new Set(concepts.map(concept=>concept.slug)));
    const result=await generateKnowledgeOverview(actor,{sourceHash:initial.sourceHash});
    assert.equal(result.mode,"fixture");
    const all=result.overview.groups.flatMap(group=>group.conceptSlugs);
    assert.equal(all.length,250); assert.equal(new Set(all).size,250);
    assert.equal(new Set(result.overview.groups.map(group=>group.id)).size,result.overview.groups.length);
    const after=await repo.getSnapshot(actor);
    for(const field of ["profile","concepts","edges","events","metadata"] as const) assert.deepEqual(after[field],original[field]);
    const repeated=await generateKnowledgeOverview(actor,{sourceHash:initial.sourceHash});
    assert.equal(repeated.runId,result.runId);
    const branch=concepts.slice(0,10).map(concept=>concept.slug);
    const branchState=await getKnowledgeOverview(repo,actor,undefined,branch);
    assert.equal(branchState.status,"missing");
    const branchResult=await generateKnowledgeOverview(actor,{sourceHash:branchState.sourceHash,conceptSlugs:branch});
    assert.deepEqual(branchResult.overview.groups.flatMap(group=>group.conceptSlugs).sort(),branch);
    await repo.close(); repo=await createRepository({dataDir:directory}); shared.__furtherLocalRepository=Promise.resolve(repo);
    const restored=await getKnowledgeOverview(repo,actor);
    assert.equal(restored.status,"ready"); assert.deepEqual(restored.overview,result.overview);
    assert.equal((await getKnowledgeOverview(repo,actor,undefined,branch)).status,"ready");
    const other=randomUUID(); await repo.ensureUser(other,"Another learner");
    assert.equal((await getKnowledgeOverview(repo,other)).status,"empty");
    await assert.rejects(getKnowledgeOverview(repo,other,undefined,branch),/own saved map/);
  } finally { delete shared.__furtherLocalRepository; await repo.close(); if(savedMode===undefined) delete process.env.FURTHER_MODEL_MODE; else process.env.FURTHER_MODEL_MODE=savedMode; await rm(directory,{recursive:true,force:true}); }
});

test("trusted projections retain full graph freshness checks and reject foreign canonical IDs", () => {
  const a={slug:"a",title:"A",hook:"First",domain:"general"},b={slug:"b",title:"B",hook:"Second",domain:"general"};
  const snapshot={concepts:[a,b],edges:[]};
  const projection={concepts:[{slug:a.slug,title:"A summarized parent",hook:"A derived readonly description"}],edges:[]};
  const first=knowledgeOverviewSource(snapshot,projection), changed=knowledgeOverviewSource({...snapshot,concepts:[a,{...b,hook:"Updated outside this branch"}]},projection);
  assert.equal(first.sourceHash,changed.sourceHash);
  assert.notEqual(first.graphHash,changed.graphHash);
  assert.equal(first.graphHash,knowledgeGraphSignature(snapshot));
  assert.throws(()=>knowledgeOverviewSource(snapshot,{concepts:[{...a,slug:"another-owner"}],edges:[]}),/Only concepts in your saved map/);
});

test("bounded batches keep dense and cross-branch canonical relationships intact in source storage", () => {
  const concepts=Array.from({length:50},(_,i)=>({slug:`node-${i}`,title:`Node ${i}`,hook:"Saved meaning",domain:"general"}));
  const edges=concepts.flatMap((source,i)=>concepts.slice(i+1).map(target=>({src:source.slug,dst:target.slug,kind:"related" as const})));
  const snapshot={concepts,edges},batches=overviewBatches(snapshot);
  assert.ok(batches.length>1); assert.ok(batches.every(batch=>batch.edges.length<=800));
  assert.equal(snapshot.edges.length,1225);
  assert.equal(new Set(batches.flatMap(batch=>batch.concepts.map(concept=>concept.slug))).size,50);
});
