import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepository } from "../domains/data/repository.ts";
import type { FurtherRepository } from "../domains/data/contracts.ts";
import { EMBEDDING_SPACE } from "../domains/retrieval/space.ts";

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

test("completion counts deduplicate learners, require every topic member and survive reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "further-completions-"));
  const dataDir = join(directory, "pg");
  let repo = await createRepository({ dataDir });
  try {
    const { a, b, c } = await learners(repo);
    const scopes = [
      { id: "gpu", conceptSlugs: [gpu.slug] },
      { id: "memory", conceptSlugs: [mem.slug] },
      { id: "hardware", conceptSlugs: [gpu.slug, mem.slug] },
    ];
    const grade = (actorId: string, slug: string, score: number, key: string, provider = "meta", source = "agent") =>
      repo.recordEvent(actorId, { slug, kind: "explain", payload: { score, source, provider }, idempotencyKey: key });
    const counts = () => repo.getCompletionCounts(a, scopes);
    await repo.addConcepts(a, [{ ...gpu, slug: "legacy--concept-" }]);
    await grade(a, "legacy--concept-", 3, "legacy-explanation");
    assert.deepEqual(await repo.getCompletionCounts(a, [{ id: "legacy", conceptSlugs: ["legacy--concept-"] }]), { legacy: 1 });
    assert.deepEqual(await counts(), { gpu: 0, memory: 0, hardware: 0 });
    await grade(a, gpu.slug, 2, "partial-one");
    await grade(a, gpu.slug, 2, "partial-two");
    await repo.recordEvent(a, { slug: gpu.slug, kind: "watch", payload: { score: 3 }, idempotencyKey: "watched" });
    assert.deepEqual(await counts(), { gpu: 0, memory: 0, hardware: 0 });
    await Promise.all([grade(a, gpu.slug, 3, "full-one"), grade(a, gpu.slug, 3, "full-one")]);
    await grade(a, gpu.slug, 3, "full-again");
    assert.deepEqual(await counts(), { gpu: 1, memory: 0, hardware: 0 });
    await grade(b, gpu.slug, 3, "b-gpu");
    await grade(b, mem.slug, 3, "b-memory");
    await grade(c, mem.slug, 3, "c-memory");
    // Equal per-concept totals do not mean the same people completed the group.
    assert.deepEqual(await counts(), { gpu: 2, memory: 2, hardware: 1 });
    await grade(c, gpu.slug, 3, "fixture-grade", "fixture");
    await grade(c, gpu.slug, 3, "user-grade", "meta", "user");
    await grade(c, gpu.slug, 4, "invalid-grade");
    assert.deepEqual(await counts(), { gpu: 2, memory: 2, hardware: 1 });
    await grade(a, mem.slug, 3, "a-memory");
    assert.deepEqual(await counts(), { gpu: 2, memory: 3, hardware: 2 });
    assert.equal((await repo.getCompletionCounts(a, [{ id: "duplicated-member", conceptSlugs: [gpu.slug, gpu.slug] }]))["duplicated-member"], 2);
    await assert.rejects(repo.getCompletionCounts(a, [{ id: "foreign", conceptSlugs: ["not-owned"] }]), /only for topics/);
    await assert.rejects(repo.getCompletionCounts(a, [{ id: "same", conceptSlugs: [gpu.slug] }, { id: "same", conceptSlugs: [mem.slug] }]), /unique IDs/);
    await repo.close();
    repo = await createRepository({ dataDir });
    assert.deepEqual(await counts(), { gpu: 2, memory: 3, hardware: 2 });
    await repo.resetLearningMap(b, "remove-b-evidence");
    assert.deepEqual(await counts(), { gpu: 1, memory: 2, hardware: 1 });
  } finally { await repo.close(); await rm(directory, { recursive: true, force: true }); }
});

test("map reset clears only the owner's learning, invalidates leased indexing and preserves retry receipts after reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "further-reset-"));
  const dataDir = join(directory, "pg");
  let repo = await createRepository({ dataDir });
  try {
    const account = await repo.auth.createPasswordAccount({ email: "reset@example.test", username: "reset_owner", displayName: "Reset owner", passwordHash: "synthetic-test-hash" });
    const a = account.learnerId, b = randomUUID();
    await repo.ensureUser(b, "Peer");
    for (const id of [a, b]) {
      await repo.updateProfile(id, { currentIntent: "Keep my profile goal", staticProfile: { role: "learner", background: "Keep my background", age18Plus: true }, openToMatch: true });
      await repo.addConcepts(id, [gpu, mem], [{ src: gpu.slug, dst: mem.slug, kind: "related" }]);
      await repo.heartbeat(id);
    }
    const sessionHash = "a".repeat(64);
    await repo.auth.createSession(sessionHash, account.id, Date.now() + 60_000);
    const sessionId = await room(repo, a, b);
    await repo.appendMessage(a, sessionId, "Keep this shared conversation", { idempotencyKey: "shared-message" });
    await repo.completeSession(a, sessionId);
    const media = await repo.saveMedia({ actorId: a, kind: "image", mimeType: "image/png", localPath: "preserved-image", contentHash: "synthetic", byteSize: 10 });
    await repo.saveMetadata(a, "intent-proposal", { intent: "Private generated history" }, { source: "agent", schemaVersion: 1 });
    const parent = await repo.beginAgentRun({ id: randomUUID(), actorId: a, agentId: "knowledge-map", input: { text: "Old question" } });
    const child = await repo.beginAgentRun({ id: randomUUID(), actorId: a, agentId: "metadata", parentRunId: parent.id, input: {} });
    for (const run of [child, parent]) await repo.finishAgentRun(a, run.id, { output: { saved: true } });
    const vector = [1, ...new Array<number>(767).fill(0)];
    const jobs = await repo.claimIndexJobs(a, EMBEDDING_SPACE);
    const leased = jobs.find(job => job.entityType === "concept")!;
    assert.ok(leased);
    const ready = jobs.find(job => job.entityType === "concept" && job.id !== leased.id)!;
    assert.equal(await repo.completeIndexJob(a, ready.id, ready.leaseToken!, vector), true);
    const profile = await repo.getProfile(a), peerBefore = await repo.getSnapshot(b);

    await Promise.all([repo.resetLearningMap(a, "reset-once"), repo.resetLearningMap(a, "reset-once")]);
    const empty = await repo.getSnapshot(a);
    assert.deepEqual(empty.concepts, []);
    assert.deepEqual(empty.edges, []);
    assert.deepEqual(empty.events, []);
    assert.deepEqual(empty.metadata, []);
    assert.deepEqual(await repo.getAgentRuns(a), []);
    assert.deepEqual((await repo.getOwnedVectors(a, EMBEDDING_SPACE)).filter(item => item.entityType !== "intent"), []);
    assert.equal(await repo.completeIndexJob(a, leased.id, leased.leaseToken!, vector), false);
    await assert.rejects(repo.recordEvent(a, { slug: gpu.slug, kind: "open", idempotencyKey: "late-old-event" }), /no longer in your learning map/);
    assert.deepEqual(await repo.getProfile(a), profile);
    assert.deepEqual(await repo.getSnapshot(b), peerBefore);
    assert.equal((await repo.auth.sessionAccount(sessionHash))?.id, account.id);
    assert.equal((await repo.getMedia(a, media.id)).localPath, media.localPath);
    assert.equal((await repo.getSession(a, sessionId)).messages[0].text, "Keep this shared conversation");
    assert.ok((await repo.getConcepts()).some(concept => concept.slug === gpu.slug));
    await repo.close(); repo = await createRepository({ dataDir });
    await repo.addConcepts(a, [mem]);
    await repo.resetLearningMap(a, "reset-once");
    assert.deepEqual((await repo.getSnapshot(a)).concepts.map(concept => concept.slug), [mem.slug]);
    await repo.resetLearningMap(a, "reset-again");
    assert.deepEqual((await repo.getSnapshot(a)).concepts, []);
  } finally { await repo.close(); await rm(directory, { recursive: true, force: true }); }
});

test("map reset refuses active guides, invitations and rooms without partially removing learning", async () => {
  const repo = await createRepository();
  try {
    const { a, b } = await learners(repo);
    const run = await repo.beginAgentRun({ id: randomUUID(), actorId: a, agentId: "knowledge-map", input: {} });
    await assert.rejects(repo.resetLearningMap(a, "guarded-reset"), { code: "LEARNING_MAP_BUSY" });
    assert.equal((await repo.getSnapshot(a)).concepts.length, 2);
    await repo.finishAgentRun(a, run.id, { error: "Synthetic completed failure" });
    const invite = await repo.invite(a, b, gpu.slug);
    await assert.rejects(repo.resetLearningMap(a, "guarded-reset"), { code: "LEARNING_MAP_BUSY" });
    await repo.respondToInvite(a, invite.id, "accept");
    const accepted = await repo.respondToInvite(b, invite.id, "accept");
    await assert.rejects(repo.resetLearningMap(a, "guarded-reset"), { code: "LEARNING_MAP_BUSY" });
    assert.equal((await repo.getSnapshot(a)).concepts.length, 2);
    await repo.completeSession(a, accepted.sessionId!);
    await repo.resetLearningMap(a, "guarded-reset");
    assert.deepEqual((await repo.getSnapshot(a)).concepts, []);
    assert.equal((await repo.getSnapshot(b)).concepts.length, 2);
  } finally { await repo.close(); }
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

test("local data: concurrent invitations reserve a learner once and reject incompatible retries",async()=>{
  const r=await createRepository();
  try {
    const {a,b,c}=await learners(r);
    const results=await Promise.allSettled([r.invite(a,b,"gpu"),r.invite(c,b,"gpu")]);
    assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
    assert.equal(results.filter(result=>result.status==="rejected").length,1);
    const invitations=(await r.getInvitations(b)).filter(inv=>inv.status==="pending");
    assert.equal(invitations.length,1);
    const inv=invitations[0],other=inv.fromUserId===b?inv.toUserId:inv.fromUserId;
    const symmetric=await r.invite(b,other,"gpu");
    assert.equal(symmetric.id,inv.id);
    await assert.rejects(r.invite(b,other,"memory-bandwidth"),/another pending invitation/);
    await r.respondToInvite(b,inv.id,"accept");
    await r.respondToInvite(other,inv.id,"accept");
    await assert.rejects(r.invite(a===other?c:a,b,"gpu"),/already in a session/);
    assert.equal((await r.getInvitations(b)).filter(item=>item.status==="accepted").length,1);
  } finally {await r.close();}
});

test("local data: pending reservations hide busy peers and preserve only the exact pair topic",async()=>{
  const r=await createRepository();
  try {
    const {a,b,c}=await learners(r);
    const invite=await r.invite(a,b,"gpu");
    const fromA=await r.listCandidates(a),fromB=await r.listCandidates(b);
    assert.deepEqual(fromA.map(peer=>peer.id),[b]);
    assert.deepEqual(fromB.map(peer=>peer.id),[a]);
    assert.deepEqual(fromA[0].activeConcepts,["gpu"]);
    assert.deepEqual(fromB[0].activeConcepts,["gpu"]);
    assert.deepEqual(await r.listCandidates(c),[]);
    assert.equal((await r.invite(b,a,"gpu")).id,invite.id);
    await r.respondToInvite(b,invite.id,"decline");
    assert.deepEqual(new Set((await r.listCandidates(c)).map(peer=>peer.id)),new Set([a,b]));
  } finally {await r.close();}
});

test("local data: minimum shared time is enforced during invitation and every acceptance",async()=>{
  const r=await createRepository();
  try {
    const {a,b}=await learners(r);
    await r.updateProfile(b,{availableMinutes:5});
    await assert.rejects(r.invite(a,b,"gpu"),/at least 10 minutes/);
    assert.deepEqual(await r.getInvitations(a),[]);
    await r.updateProfile(b,{availableMinutes:20});
    const inv=await r.invite(a,b,"gpu");
    await r.updateProfile(b,{availableMinutes:5});
    await assert.rejects(r.respondToInvite(a,inv.id,"accept"),/at least 10 minutes/);
    assert.deepEqual((await r.getInvitation(a,inv.id)).acceptedBy,[]);
    await r.updateProfile(b,{availableMinutes:20});
    await r.respondToInvite(a,inv.id,"accept");
    await r.updateProfile(a,{availableMinutes:5});
    await assert.rejects(r.respondToInvite(b,inv.id,"accept"),/at least 10 minutes/);
    const waiting=await r.getInvitation(a,inv.id);
    assert.equal(waiting.status,"pending");assert.equal(waiting.sessionId,undefined);
    assert.deepEqual(waiting.acceptedBy,[a]);
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
    const ownSnapshot=await r.getSnapshot(a);
    assert.deepEqual(ownSnapshot.peerNames,{[b]:"Blair"});
    assert.equal(c in ownSnapshot.peerNames!,false);
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

test("saved solo lesson lookup survives reopen, skips failed/foreign/mode variants and ignores recent-run pagination", async () => {
  const directory = await mkdtemp(join(tmpdir(), "further-lessons-"));
  const dataDir = join(directory, "pg");
  let repo = await createRepository({ dataDir });
  try {
    const { a, b } = await learners(repo);
    const instruction = "Lesson recipe v1, depth 1";
    const persist = async (actorId: string, message: string, mode: "live" | "fixture", fail = false) => {
      const id = randomUUID();
      await repo.beginAgentRun({ id, actorId, agentId: "learning-companion", input: { mode: "solo", concept: "gpu", message } });
      await repo.finishAgentRun(actorId, id, fail ? { error: "A failed attempt" } : { output: { mode, data: { body: "A saved lesson" } } });
      return id;
    };
    const id = await persist(a, instruction, "live");
    await persist(a, "Lesson recipe v1, depth 2", "live");
    await persist(a, instruction, "fixture");
    await persist(b, instruction, "live");
    await persist(a, instruction, "live", true);
    for (let i = 0; i < 105; i++) {
      const unrelated = randomUUID();
      await repo.beginAgentRun({ id: unrelated, actorId: a, agentId: "metadata", input: { text: `Unrelated ${i}` } });
      await repo.finishAgentRun(a, unrelated, { output: { mode: "live" } });
    }
    await repo.close(); repo = await createRepository({ dataDir });
    assert.equal((await repo.getLatestLessonRun(a, "gpu", instruction, "live"))?.id, id);
    assert.notEqual((await repo.getLatestLessonRun(b, "gpu", instruction, "live"))?.id, id);
    assert.equal(await repo.getLatestLessonRun(a, "gpu", "Changed recipe", "live"), null);
    assert.equal(await repo.getLatestLessonRun(a, "memory-bandwidth", instruction, "live"), null);
    assert.equal((await repo.getLatestLessonRun(a, "gpu", instruction, "fixture"))?.output?.mode, "fixture");
  } finally { await repo.close(); await rm(directory, { recursive: true, force: true }); }
});
