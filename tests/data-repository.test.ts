import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepository } from "../domains/data/repository.ts";
import type { FurtherRepository } from "../domains/data/contracts.ts";

const gpu={slug:"gpu",title:"Graphics processors",hook:"Parallel work",domain:"ai-tech"};
const mem={slug:"memory-bandwidth",title:"Memory bandwidth",hook:"Feeding the processor",domain:"ai-tech"};
async function learners(r:FurtherRepository) {
  const a=randomUUID(),b=randomUUID(),c=randomUUID();
  for(const [id,name] of [[a,"Alex"],[b,"Blair"],[c,"Casey"]]) {
    await r.ensureUser(id,name);
    await r.updateProfile(id,{staticProfile:{role:"learner",background:"private background",age18Plus:true},openToMatch:true});
    await r.addConcepts(id,[gpu,mem],[{src:gpu.slug,dst:mem.slug,kind:"related"}]);
    await r.heartbeat(id);
  }
  return {a,b,c};
}
async function room(r:FurtherRepository,a:string,b:string) {
  const invite=await r.invite(a,b,"gpu");
  const first=await r.respondToInvite(a,invite.id,"accept");
  assert.equal(first.status,"pending"); assert.equal(first.sessionId,undefined);
  const accepted=await r.respondToInvite(b,invite.id,"accept");
  assert.equal(accepted.status,"accepted"); assert.ok(accepted.sessionId);
  return accepted.sessionId!;
}

test("local data: durable profile, private snapshot and idempotent graph/events survive reopen",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"further-data-"));
  const dataDir=join(dir,"pg");
  let r=await createRepository({dataDir});
  try {
    const {a,b}=await learners(r);
    await r.updateProfile(a,{displayName:"Alex changed",currentIntent:"A private question"});
    await r.ensureUser(a,"Do not overwrite");
    await r.addConcepts(a,[gpu,mem]);
    assert.equal((await r.getSnapshot(a)).events.filter(e=>e.kind==="seed").length,2);
    const e={slug:"gpu",kind:"open" as const,idempotencyKey:"open-one"};
    const [one,two]=await Promise.all([r.recordEvent(a,e),r.recordEvent(a,e)]);
    assert.equal(one.id,two.id);
    await assert.rejects(r.recordEvent(a,{...e,slug:"memory-bandwidth"}),/another event/);
    await r.saveMetadata(a,"intent",{private:"only Alex"},{source:"agent",schemaVersion:1,model:"muse-spark-1.3",confirmed:false});
    assert.equal((await r.getSnapshot(b)).metadata.length,0);
    assert.equal((await r.getSnapshot(b)).events.some(x=>x.id===one.id),false);
    await r.close();
    r=await createRepository({dataDir});
    const restored=await r.getSnapshot(a);
    assert.equal(restored.profile.displayName,"Alex changed");
    assert.equal(restored.profile.currentIntent,"A private question");
    assert.equal(restored.events.filter(e=>e.kind==="open").length,1);
    assert.equal(restored.metadata[0].values.private,"only Alex");
  } finally {await r.close();await rm(dir,{recursive:true,force:true});}
});

test("local data: only eligible, fresh, consented peer projection is exposed",async()=>{
  const r=await createRepository();
  try {
    const {a,b,c}=await learners(r);
    let peers=await r.listCandidates(a);
    assert.equal(peers.length,2);
    assert.equal("staticProfile" in peers[0],false);
    assert.equal("currentIntent" in peers[0],false);
    assert.equal("metadata" in peers[0],false);
    await r.updateProfile(c,{language:"fr"});
    peers=await r.listCandidates(a);assert.deepEqual(peers.map(x=>x.id),[b]);
    assert.equal(await r.isBlocked(a,b),false);
    assert.equal(await r.isBlocked(b,a),false);
    await r.block(b,a);
    assert.equal(await r.isBlocked(a,b),true);
    assert.equal(await r.isBlocked(b,a),true);
    assert.equal(await r.isBlocked(a,c),false);
    assert.equal((await r.listCandidates(a)).length,0);
    await assert.rejects(r.invite(a,b,"gpu"),/no longer available/);
    await r.updateProfile(c,{language:"en",openToMatch:false});
    assert.equal((await r.listCandidates(a)).length,0);
    await r.updateProfile(a,{openToMatch:false});
    assert.equal((await r.listCandidates(a)).length,0);
  } finally {await r.close();}
});

test("local data: dual acceptance pins the exact room; retries and completion are idempotent",async()=>{
  const r=await createRepository();
  try {
    const {a,b,c}=await learners(r);
    const [i1,i2]=await Promise.all([r.invite(a,b,"gpu"),r.invite(b,a,"gpu")]);
    assert.equal(i1.id,i2.id);
    await r.respondToInvite(a,i1.id,"accept");
    const [accepted1,accepted2]=await Promise.all([r.respondToInvite(b,i1.id,"accept"),r.respondToInvite(b,i1.id,"accept")]);
    assert.equal(accepted1.sessionId,accepted2.sessionId);
    const sid=accepted1.sessionId!;
    assert.equal((await r.getInvitation(a,i1.id)).sessionId,sid);
    assert.equal((await r.listCandidates(c)).some(p=>p.id===a||p.id===b),false);
    assert.deepEqual(await r.listCandidates(a),[]);
    await assert.rejects(r.getSession(c,sid),/not found/);
    await assert.rejects(r.getInvitation(c,i1.id),/not found/);
    const m1=await r.appendMessage(a,sid,"Here is how parallel work helps.",{idempotencyKey:"a1"});
    const m2=await r.appendMessage(a,sid,"Here is how parallel work helps.",{idempotencyKey:"a1"});
    assert.equal(m1.id,m2.id);
    await assert.rejects(r.appendMessage(a,sid,"A changed message",{idempotencyKey:"a1"}),/another message payload/);
    await assert.rejects(r.appendMessage(a,sid,m1.text,{kind:"facilitator",idempotencyKey:"a1"}),/another message payload/);
    await assert.rejects(r.appendMessage(a,sid,m1.text,{idempotencyKey:"a1",provenance:{source:"agent",schemaVersion:1}}),/another message payload/);
    await r.appendMessage(b,sid,"Memory must feed each worker.",{idempotencyKey:"b1"});
    await Promise.all([r.completeSession(a,sid,["We exchanged explanations"]),r.completeSession(b,sid,["We exchanged explanations"])]);
    for(const id of [a,b]) assert.equal((await r.getSnapshot(id)).events.filter(e=>e.kind==="session").length,1);
    assert.equal((await r.getSession(a,sid)).context.completion && ((await r.getSession(a,sid)).context.completion as {credited:boolean}).credited,true);
    await assert.rejects(r.appendMessage(a,sid,"Late message",{idempotencyKey:"late"}),/ended/);
  } finally {await r.close();}
});

test("local data: empty and one-sided sessions do not increase progress; blocks persist",async()=>{
  const r=await createRepository();
  try {
    const {a,b}=await learners(r);
    const empty=await room(r,a,b);
    await r.completeSession(a,empty);
    assert.equal((await r.getSnapshot(a)).events.filter(e=>e.kind==="session").length,0);
    const one=await room(r,a,b);
    await r.appendMessage(a,one,"Only one person spoke",{idempotencyKey:"single"});
    await r.completeSession(b,one);
    assert.equal((await r.getSnapshot(a)).events.filter(e=>e.kind==="session").length,0);
    const next=await room(r,a,b);
    await r.appendMessage(a,next,"Both people spoke before the block",{idempotencyKey:"before-block-a"});
    await r.appendMessage(b,next,"This room must still close without credit",{idempotencyKey:"before-block-b"});
    await r.block(a,b);
    const closed=await r.getSession(b,next);
    assert.ok(closed.endedAt);
    assert.deepEqual(closed.context.completion,{credited:false,reason:"blocked",evidence:"no learning credit recorded"});
    await Promise.all([r.completeSession(a,next),r.completeSession(b,next),r.block(a,b)]);
    for(const id of [a,b]) assert.equal((await r.getSnapshot(id)).events.filter(e=>e.kind==="session").length,0);
    await assert.rejects(r.appendMessage(b,next,"Blocked message",{idempotencyKey:"blocked"}),/ended/);
    assert.equal((await r.listCandidates(b)).some(p=>p.id===a),false);
    const report=await r.report(a,b,"Unwanted message",next);assert.ok(report);
  } finally {await r.close();}
});

test("local data: vector retrieval is actor/model/revision scoped and validates dimensions",async()=>{
  const r=await createRepository();
  try {
    const a=randomUUID(),b=randomUUID();await r.ensureUser(a);await r.ensureUser(b);
    const v=Array.from({length:768},(_,i)=>i===0?1:0);
    const base={entityType:"intent" as const,entityId:"current",text:"Parallel computing",vector:v,model:"FacebookAI/roberta-base",modelRevision:"pinned-test-revision",dimensions:768 as const,contentHash:"test-hash",mode:"local-meta" as const};
    await r.putVector({...base,id:randomUUID(),actorId:a});
    await r.putVector({...base,id:randomUUID(),actorId:b,text:"A different private text"});
    const hit=await r.searchVectors(a,v,{model:base.model,modelRevision:base.modelRevision});
    assert.equal(hit.length,1);assert.equal(hit[0].text,base.text);assert.ok(hit[0].similarity>0.999);
    assert.equal((await r.searchVectors(a,v,{model:base.model,modelRevision:"other"})).length,0);
    assert.equal((await r.searchVectors(a,v,{model:"other",modelRevision:base.modelRevision})).length,0);
    await assert.rejects(r.putVector({...base,id:randomUUID(),actorId:a,vector:[1,2]}),/768/);
    await assert.rejects(r.searchVectors(a,new Array(768).fill(0),{model:base.model,modelRevision:base.modelRevision}),/nonzero/);
  } finally {await r.close();}
});

test("local data: private media and run lineage cannot cross learner boundaries",async()=>{
  const r=await createRepository();
  try {
    const a=randomUUID(),b=randomUUID();await r.ensureUser(a);await r.ensureUser(b);
    const media=await r.saveMedia({actorId:a,kind:"image",mimeType:"image/png",localPath:".local/media/test.png",contentHash:"hash",byteSize:10});
    assert.equal((await r.getMedia(a,media.id)).actorId,a);
    await assert.rejects(r.getMedia(b,media.id),/not found/);
    const run=await r.beginAgentRun({id:randomUUID(),actorId:a,agentId:"knowledge-map",input:{text:"test"}});
    await assert.rejects(r.beginAgentRun({id:randomUUID(),actorId:b,agentId:"metadata",parentRunId:run.id,input:{}}),/Parent/);
    await r.finishAgentRun(a,run.id,{output:{ok:true},model:"muse-spark-1.3",provider:"meta"});
    assert.equal((await r.getAgentRun(a,run.id))?.output?.ok,true);
    assert.equal(await r.getAgentRun(b,run.id),null);
    assert.equal((await r.getAgentRuns(a))[0].status,"succeeded");
    assert.equal((await r.getAgentRuns(b)).length,0);
  } finally {await r.close();}
});

test("local data: a second process owner cannot open the same persistent directory",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"further-lock-"));
  const dataDir=join(dir,"pg"),r=await createRepository({dataDir});
  try {await assert.rejects(createRepository({dataDir}),/already open/);} finally {await r.close();await rm(dir,{recursive:true,force:true});}
});
