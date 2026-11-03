import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepository } from "../domains/data/repository.ts";
import { EMBEDDING_MODEL,EMBEDDING_REVISION,EMBEDDING_SPACE,processIndexJobs,search,type Embedder } from "../domains/retrieval/client.ts";
import type { AgentRunRecord, FurtherRepository } from "../domains/data/contracts.ts";
import { contextualSearchText } from "../domains/retrieval/projection.ts";
const alpha={slug:"gpu-parallelism",title:"Graphics processors",hook:"Many arithmetic operations in parallel",domain:"ai-tech"};
const beta={slug:"data-parallel-work",title:"Parallel computing",hook:"Divide computation between many workers",domain:"ai-tech"};
const gamma={slug:"bread-rising",title:"Bread fermentation",hook:"Yeast produces carbon dioxide",domain:"food"};
const vector=(axis=0)=>Array.from({length:768},(_,i)=>i===axis?1:0);
const fakeEmbedder:Embedder=async texts=>({vectors:texts.map(t=>vector(t.includes("Bread")?1:0)),model:EMBEDDING_MODEL,revision:EMBEDDING_REVISION,mode:"local-meta"});
const ai={slug:"artificial-intelligence",title:"Artificial intelligence",hook:"Models learn patterns from data and use them to make predictions.",domain:"ai-tech"};
const savedMapRun = (overrides: Partial<AgentRunRecord> = {}): AgentRunRecord => ({
 id:randomUUID(),actorId:randomUUID(),agentId:"knowledge-map",status:"succeeded",
 input:{text:"How AI works ?",objective:"expand"},
 output:{mode:"live",data:{concepts:[{slug:ai.slug}]}},createdAt:100,...overrides,
});

test("short owner queries reuse current saved concept descriptions and question-linked live maps",()=>{
 assert.equal(contextualSearchText(ai.slug,[ai],[]),`${ai.slug}\nSaved learning context:\n${ai.title}. ${ai.hook}`);
 assert.equal(contextualSearchText(" ARTIFICIAL   INTELLIGENCE ",[ai],[]),` ARTIFICIAL   INTELLIGENCE \nSaved learning context:\n${ai.title}. ${ai.hook}`);
 assert.equal(contextualSearchText("How AI works ?",[ai],[savedMapRun()]),`How AI works ?\nSaved learning context:\n${ai.title}. ${ai.hook}`);
 const newer={...ai,hook:"Current saved description."};
 assert.match(contextualSearchText("How AI works ?",[newer],[savedMapRun()]),/Current saved description/);
});

test("query context excludes unrelated, fixture, failed and removed learning without rewriting long questions",()=>{
 const query="How AI works ?";
 for(const run of [
  savedMapRun({input:{text:"How bread rises?",objective:"expand"}}),
  savedMapRun({status:"failed"}),savedMapRun({agentId:"metadata"}),
  savedMapRun({output:{mode:"fixture",data:{concepts:[{slug:ai.slug}]}}}),
  savedMapRun({output:{mode:"live",data:{concepts:[{slug:gamma.slug}]}}}),
 ]) assert.equal(contextualSearchText(query,[ai],[run]),query);
 assert.equal(contextualSearchText(query,[],[savedMapRun()]),query);
 const long="How do artificial intelligence systems learn from examples and use those patterns to make reliable predictions?";
 assert.equal(contextualSearchText(long,[ai],[savedMapRun({input:{text:long,objective:"expand"}})]),long);
});

test("query context uses the latest matching live map and bounds descriptive text",()=>{
 const old=savedMapRun({createdAt:100});
 const latest=savedMapRun({createdAt:200,output:{mode:"live",data:{concepts:[{slug:gamma.slug}]}}});
 const text=contextualSearchText("How AI works ?",[ai,gamma],[old,latest]);
 assert.match(text,/Bread fermentation/);assert.equal(text.includes(ai.hook),false);
 const large={...ai,hook:"x".repeat(4000)};
 const bounded=contextualSearchText(ai.slug,[large],[]);
 assert.equal(bounded.split("Saved learning context:\n")[1].length,1000);
});

test("owner search embeds linked context once, keeps results owner-scoped and propagates encoder failures",async t=>{
 const r=await createRepository();const oldToken=process.env.FURTHER_EMBEDDING_TOKEN;
 process.env.FURTHER_EMBEDDING_TOKEN="synthetic-search-token";
 try {
  const a=await user(r,"A",ai),b=await user(r,"B",gamma);
  for(const id of[a,b])await processIndexJobs(r,id,{embedder:fakeEmbedder});
  const run=savedMapRun({actorId:a});
  await r.beginAgentRun({id:run.id,actorId:a,agentId:run.agentId,input:run.input});
  await r.finishAgentRun(a,run.id,{output:run.output!});
  const submitted:string[][]=[];
  const request=t.mock.method(globalThis,"fetch",async (_input:unknown,init?:RequestInit)=>{
   submitted.push(JSON.parse(String(init?.body)).texts);
   return Response.json({vectors:[vector()],model:EMBEDDING_MODEL,revision:EMBEDDING_REVISION,mode:"local-meta"});
  });
  const hits=await search(r,a,"How AI works ?");
  assert.equal(submitted.length,1);
  assert.deepEqual(submitted[0],[`How AI works ?\nSaved learning context:\n${ai.title}. ${ai.hook}`]);
  assert.ok(hits.some(hit=>hit.entityId===ai.slug));
  assert.equal(hits.some(hit=>hit.entityId===gamma.slug),false);
  await search(r,b,"How AI works ?");
  assert.deepEqual(submitted[1],["How AI works ?"]);
  request.mock.mockImplementation(async()=>{throw new Error("Encoder unavailable");});
  await assert.rejects(search(r,a,ai.slug),/Encoder unavailable/);
 }finally{
  if(oldToken===undefined)delete process.env.FURTHER_EMBEDDING_TOKEN;else process.env.FURTHER_EMBEDDING_TOKEN=oldToken;
  await r.close();
 }
});
async function user(r:FurtherRepository,name:string,concept=alpha){const id=randomUUID();await r.ensureUser(id,name);await r.updateProfile(id,{openToMatch:true,staticProfile:{role:"learner",background:"private",age18Plus:true},currentIntent:`Private question from ${name}`});await r.addConcepts(id,[concept]);await r.heartbeat(id);return id;}

test("index jobs persist with source mutations, deduplicate, and recover expired leases after reopen",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"further-index-"));const path=join(dir,"pg");let r=await createRepository({dataDir:path});
 try {
  const a=await user(r,"A");assert.equal((await r.getIndexStatus(a,EMBEDDING_SPACE)).pending,2);
  await r.reconcileIndex(a,EMBEDDING_SPACE);await r.addConcepts(a,[alpha]);assert.equal((await r.getIndexStatus(a,EMBEDDING_SPACE)).total,2);
  const first=await r.claimIndexJobs(a,EMBEDDING_SPACE,16,100);assert.equal(first.length,2);assert.equal((await r.claimIndexJobs(a,EMBEDDING_SPACE)).length,0);
  await r.close();r=await createRepository({dataDir:path});await new Promise(resolve=>setTimeout(resolve,120));
  const recovered=await r.claimIndexJobs(a,EMBEDDING_SPACE);assert.equal(recovered.length,2);assert.notEqual(recovered[0].leaseToken,first.find(j=>j.id===recovered[0].id)?.leaseToken);
  assert.equal(await r.completeIndexJob(a,first[0].id,first[0].leaseToken!,vector()),false);
  for(const job of recovered)assert.equal(await r.completeIndexJob(a,job.id,job.leaseToken!,vector()),true);
  const status=await r.reconcileIndex(a,EMBEDDING_SPACE);assert.equal(status.ready,2);assert.equal(status.total,2);
 }finally{await r.close();await rm(dir,{recursive:true,force:true});}
});

test("a newer source revision invalidates an in-flight embedding and hides stale retrieval",async()=>{
 const r=await createRepository();try{
  const a=await user(r,"A");let calls=0;const counted:Embedder=async texts=>{calls+=texts.length;return fakeEmbedder(texts);};
  await processIndexJobs(r,a,{embedder:counted});assert.equal(calls,2);await r.reconcileIndex(a,EMBEDDING_SPACE);await processIndexJobs(r,a,{embedder:counted});assert.equal(calls,2);
  await r.updateProfile(a,{currentIntent:"A revised private question"});
  const [old]=await r.claimIndexJobs(a,EMBEDDING_SPACE);assert.equal(old.entityType,"intent");
  await r.updateProfile(a,{currentIntent:"The newest private question"});
  assert.equal(await r.completeIndexJob(a,old.id,old.leaseToken!,vector()),false);
  assert.equal((await r.getOwnedVectors(a,{...EMBEDDING_SPACE,entityType:"intent"})).length,0);
  assert.equal((await r.searchVectors(a,vector(),{...EMBEDDING_SPACE,entityType:"intent"})).length,0);
  await processIndexJobs(r,a,{embedder:counted});assert.equal(calls,3);
  assert.equal((await r.getOwnedVectors(a,{...EMBEDDING_SPACE,entityType:"intent"}))[0].text,"The newest private question");
  await r.updateProfile(a,{currentIntent:""});assert.equal((await r.getIndexStatus(a,EMBEDDING_SPACE)).total,1);assert.equal((await r.getOwnedVectors(a,{...EMBEDDING_SPACE,entityType:"intent"})).length,0);
 }finally{await r.close();}
});

test("failed embedding batches remain durable, ungraded retry work and return safe status",async()=>{
 const r=await createRepository();try{
  const a=await user(r,"A");const result=await processIndexJobs(r,a,{embedder:async()=>{throw new Error("sensitive-provider-body");}});
  assert.equal(result.retry,2);assert.ok(result.nextAttemptAt!>Date.now());assert.equal(JSON.stringify(result).includes("private"),false);
  assert.equal((await r.claimIndexJobs(a,EMBEDDING_SPACE)).length,0);assert.equal((await r.getSnapshot(a)).events.some(e=>e.kind==="explain"),false);
  await assert.rejects(r.enqueueIndexItems(a,[{entityType:"concept",entityId:alpha.slug,text:"private replacement"}],EMBEDDING_SPACE),/saved map/);
 }finally{await r.close();}
});

test("PGvector discovery crosses concept IDs but excludes private intent and revoked peers",async()=>{
 const r=await createRepository();try{
  const a=await user(r,"A"),b=await user(r,"B",beta),c=await user(r,"C",gamma);
  for(const id of[a,b,c])await processIndexJobs(r,id,{embedder:fakeEmbedder});
  let result=await r.searchPeerVectors(a,{...EMBEDDING_SPACE});assert.equal(result.status,"ready");assert.equal(result.queryCount,1);assert.equal(result.indexedPeerCount,2);
  const related=result.hits.find(h=>h.peerId===b)!;assert.equal(related.ownConceptSlug,alpha.slug);assert.equal(related.peerConceptSlug,beta.slug);assert.equal(related.similarity,1);
  assert.equal(result.hits.find(h=>h.peerId===c)!.similarity,0);assert.equal(JSON.stringify(result).includes("Private question"),false);
  assert.equal(result.hits.every(h=>h.peerConceptSlug!=="current"),true);
  const wrongSpace=await r.searchPeerVectors(a,{model:EMBEDDING_MODEL,modelRevision:"different-space"});assert.equal(wrongSpace.hits.length,0);assert.equal(wrongSpace.indexedQueryCount,0);
  await assert.rejects(r.searchPeerVectors(a,{...EMBEDDING_SPACE,conceptSlugs:[beta.slug]}),/own saved map/);
  await r.updateProfile(b,{openToMatch:false});result=await r.searchPeerVectors(a,{...EMBEDDING_SPACE,peerIds:[b,c]});assert.equal(result.hits.some(h=>h.peerId===b),false);
  await r.block(a,c);assert.equal((await r.searchPeerVectors(a,{...EMBEDDING_SPACE})).hits.length,0);
 }finally{await r.close();}
});

test("cross-concept invitations reserve each learner's own topic and completion preserves ownership",async()=>{
 const r=await createRepository();try{
  const a=await user(r,"A"),b=await user(r,"B",beta);
  await r.addConcepts(b,[gamma]);
  await assert.rejects(r.invite(a,b,alpha.slug),/topics are no longer available/);
  const inv=await r.invite(a,b,alpha.slug,{context:{peerConceptSlug:beta.slug}});
  await assert.rejects(r.invite(a,b,alpha.slug,{context:{peerConceptSlug:gamma.slug}}),/another pending invitation/);
  assert.equal((await r.invite(b,a,beta.slug,{context:{peerConceptSlug:alpha.slug}})).id,inv.id);
  assert.deepEqual((await r.listCandidates(a))[0].activeConcepts,[beta.slug]);assert.deepEqual((await r.listCandidates(b))[0].activeConcepts,[alpha.slug]);
  await r.respondToInvite(a,inv.id,"accept");const accepted=await r.respondToInvite(b,inv.id,"accept");const sid=accepted.sessionId!;
  await r.appendMessage(a,sid,"I use many parallel operations",{idempotencyKey:"a"});await r.appendMessage(b,sid,"I divide tasks among workers",{idempotencyKey:"b"});await r.completeSession(a,sid);
  const bs=await r.getSnapshot(b);assert.equal(bs.concepts.some(c=>c.slug===alpha.slug),false);assert.equal(bs.events.find(e=>e.kind==="session")!.slug,beta.slug);
 }finally{await r.close();}
});

test("new parent-subtopic edges reject cycles atomically",async()=>{
 const r=await createRepository();try{
  const a=await user(r,"A");await r.addConcepts(a,[beta,gamma],[{src:alpha.slug,dst:beta.slug,kind:"part_of"},{src:beta.slug,dst:gamma.slug,kind:"part_of"}]);
  await assert.rejects(r.addConcepts(a,[],[{src:gamma.slug,dst:alpha.slug,kind:"part_of"}]),/own subtopics/);
  assert.equal((await r.getSnapshot(a)).edges.filter(e=>e.kind==="part_of").length,2);
 }finally{await r.close();}
});

test("inferred learning metadata indexes selected private fields and replaces only its derived vector",async()=>{
 const r=await createRepository();try{
  const a=await user(r,"A"),b=await user(r,"B",beta);
  const values={intent:"Understand GPU scheduling",goals:["Explain parallel execution"],concepts:[{title:"Warp scheduling",slug:"warp"}],matchingText:"I want to compare GPU execution",language:"secret-language",availableMinutes:123,experience:"secret-experience",email:"private@example.com",background:"private biography",age:42};
  const one=await r.saveMetadata(a,"intent-proposal",values,{source:"agent",model:"muse-spark-1.3",schemaVersion:1,confirmed:false});
  await processIndexJobs(r,a,{embedder:fakeEmbedder});
  let vectors=await r.getOwnedVectors(a,{...EMBEDDING_SPACE,entityType:"metadata"});assert.equal(vectors.length,1);assert.equal(vectors[0].entityId,one.id);assert.match(vectors[0].text,/Warp scheduling/);
  assert.equal(/secret-language|secret-experience|private@example|private biography|123/.test(vectors[0].text),false);
  const two=await r.saveMetadata(a,"intent-proposal",{intent:"Explore task queues",matchingText:"Contact private@example.com for learning"},{source:"agent",schemaVersion:1,confirmed:false});
  assert.equal((await r.getOwnedVectors(a,{...EMBEDDING_SPACE,entityType:"metadata"})).length,0);
  await processIndexJobs(r,a,{embedder:fakeEmbedder});vectors=await r.getOwnedVectors(a,{...EMBEDDING_SPACE,entityType:"metadata"});assert.equal(vectors.length,1);assert.equal(vectors[0].entityId,two.id);assert.equal(vectors[0].text.includes("private@example.com"),false);
  assert.equal((await r.getSnapshot(a)).metadata.length,2);assert.equal((await r.getIndexStatus(a,EMBEDDING_SPACE)).total,3);
  assert.equal((await r.getSnapshot(a)).profile.currentIntent,"Private question from A");
  await processIndexJobs(r,b,{embedder:fakeEmbedder});const peer=await r.searchPeerVectors(b,EMBEDDING_SPACE);assert.equal(peer.hits.every(h=>h.peerConceptSlug!==one.id&&h.peerConceptSlug!==two.id),true);
 }finally{await r.close();}
});

test("empty peer projections do not keep discovery indexing; missing unrelated peers do not invalidate a ready pair",async()=>{
 const r=await createRepository();try{
  const a=await user(r,"A"),b=await user(r,"B",beta),empty=randomUUID();
  await r.ensureUser(empty,"Empty map");await r.updateProfile(empty,{openToMatch:true,staticProfile:{role:"learner",background:"",age18Plus:true}});await r.heartbeat(empty);
  for(const id of[a,b])await processIndexJobs(r,id,{embedder:fakeEmbedder});
  let result=await r.searchPeerVectors(a,EMBEDDING_SPACE);assert.equal(result.status,"ready");assert.equal(result.eligiblePeerCount,1);assert.equal(result.indexedPeerCount,1);assert.ok(result.hits.some(h=>h.peerId===b));
  const unrelated=await user(r,"Waiting for unrelated index",gamma);
  result=await r.searchPeerVectors(a,EMBEDDING_SPACE);assert.equal(result.status,"indexing");assert.equal(result.eligiblePeerCount,2);assert.equal(result.indexedPeerCount,1);assert.equal(result.indexedQueryCount,result.queryCount);assert.ok(result.hits.some(h=>h.peerId===b));assert.equal(result.hits.some(h=>h.peerId===unrelated),false);
  const selected=await r.searchPeerVectors(a,{...EMBEDDING_SPACE,peerIds:[b],conceptSlugs:[alpha.slug]});assert.equal(selected.status,"ready");assert.equal(selected.indexedQueryCount,1);assert.ok(selected.hits.some(h=>h.peerId===b));
  const pendingPair=await r.searchPeerVectors(a,{...EMBEDDING_SPACE,peerIds:[unrelated],conceptSlugs:[alpha.slug]});assert.equal(pendingPair.status,"indexing");assert.equal(pendingPair.hits.length,0);
  const pendingViewer=await r.searchPeerVectors(unrelated,{...EMBEDDING_SPACE,peerIds:[b],conceptSlugs:[gamma.slug]});assert.equal(pendingViewer.status,"indexing");assert.equal(pendingViewer.indexedQueryCount,0);assert.equal(pendingViewer.hits.length,0);
 }finally{await r.close();}
});
