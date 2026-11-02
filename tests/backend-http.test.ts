/**
 * Real HTTP integration. Run against an isolated local fixture-mode server:
 * FURTHER_TEST_URL=http://127.0.0.1:3001 npx tsx --test tests/backend-http.test.ts
 * Never point this at a live/shared user database: the test creates local personas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import type { Snapshot, PeerCandidate } from "../domains/data/contracts.ts";
import type { MatchRequest } from "../lib/types.ts";

const base=process.env.FURTHER_TEST_URL?.replace(/\/$/,"");
if(base && !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+\/?$/.test(base)) throw new Error("FURTHER_TEST_URL must be a local HTTP origin with an explicit port");
interface Result<T> { status:number; body:T; headers:Headers; text:string }
interface Identity { actorId:string; profile:Snapshot["profile"]; personas:Array<{id:string;displayName:string}>;mode:string }
interface Bootstrap extends Snapshot { explorers:PeerCandidate[]; match:MatchRequest|null;currentSessionId:string|null }
interface MatchResponse { match:MatchRequest|null; ranked:Array<{peer:PeerCandidate;score:number}>; status?:string; sessionId?:string;session_id?:string;demo:boolean }
interface Room {id:string;peer:PeerCandidate;endedAt?:number;blocked?:boolean;match:MatchRequest;messages:Array<{id:string;who:string;text:string}>}
class Client {
  cookie="";
  async request<T=Record<string,unknown>>(path:string,method="GET",data?:unknown,extra:Record<string,string>={}):Promise<Result<T>> {
    const headers:Record<string,string>={...(this.cookie?{cookie:this.cookie}:{}),...(data===undefined?{}:{"content-type":"application/json"}),...extra};
    const response=await fetch(base!+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(90_000)});
    const setCookie=response.headers.get("set-cookie");
    if(setCookie)this.cookie=setCookie.split(";")[0];
    const text=await response.text();
    let parsed:unknown;
    try{parsed=JSON.parse(text);}catch{assert.fail(`Expected JSON for ${method} ${path}; HTTP ${response.status}; ${text.slice(0,160)}`);}
    return {status:response.status,body:parsed as T,headers:response.headers,text};
  }
  async ok<T=Record<string,unknown>>(path:string,method="GET",data?:unknown,headers:Record<string,string>={}):Promise<T> {
    const result=await this.request<T>(path,method,data,headers);
    assert.equal(result.status,200,`${method} ${path}: ${result.text.slice(0,500)}`);
    assert.match(result.headers.get("cache-control")??"",/no-store/);
    return result.body;
  }
}

test("HTTP local journey: independent identities, durable maps and genuine shared-session state",{skip:!base,timeout:240_000},async t=>{
  const health=await (await fetch(base!+"/api/health")).json() as {modelMode?:string};
  assert.equal(health.modelMode,"fixture","HTTP integration must use an isolated fixture-mode server");
  const alice=new Client(),bob=new Client(),outsider=new Client(),anonymous=new Client();
  const tag=randomUUID().slice(0,8);
  let a!:Identity,b!:Identity,c!:Identity;
  let invite!:MatchRequest;
  let sid="";
  const shared=`http-parallel-${tag}`,privateSlug=`http-private-${tag}`;
  const sharedConcept={slug:shared,title:"Parallel work",hook:"Split work among workers",domain:"ai-tech"};
  const privateConcept={slug:privateSlug,title:"A private map entry",hook:"Only one learner adds this topic",domain:"ai-tech"};
  let earlierFailure=false;
  async function step(name:string,run:()=>Promise<void>){
    await t.test(name,{skip:earlierFailure?"An earlier journey step failed":false},async()=>{
      try{await run();}catch(error){earlierFailure=true;throw error;}
    });
  }

  await step("identity boundary rejects missing/tampered cookies and cross-site requests",async()=>{
    assert.equal((await anonymous.request("/api/data/bootstrap")).status,401);
    assert.equal((await anonymous.request("/api/local/identity","POST",{displayName:"Rejected"},{origin:"https://unrelated.example"})).status,403);
    assert.equal((await anonymous.request("/api/local/identity","POST",{displayName:"Rejected"},{"sec-fetch-site":"cross-site"})).status,403);
    // Node's fetch normalizes Host; use the HTTP client to actually send the
    // hostile header so this verifies the server rather than client behavior.
    const hostileHost=await new Promise<number>((resolve,reject)=>{
      const request=httpRequest(base!+"/api/local/identity",{method:"POST",headers:{host:"unrelated.example","content-type":"application/json"}},response=>{response.resume();resolve(response.statusCode!);});
      request.on("error",reject);request.end(JSON.stringify({displayName:"Rejected"}));
    });
    assert.equal(hostileHost,403);
    const created=await alice.request<Identity>("/api/local/identity","POST",{displayName:`Alice ${tag}`});
    assert.equal(created.status,200);a=created.body;
    assert.match(created.headers.get("set-cookie")??"",/HttpOnly/);
    assert.match(created.headers.get("set-cookie")??"",/SameSite=Strict/);
    b=await bob.ok<Identity>("/api/local/identity","POST",{displayName:`Bob ${tag}`});
    c=await outsider.ok<Identity>("/api/local/identity","POST",{displayName:`Casey ${tag}`});
    assert.notEqual(a.actorId,b.actorId);assert.notEqual(a.actorId,c.actorId);
    assert.equal(a.mode,"local");
    const tampered=new Client();tampered.cookie=alice.cookie.slice(0,-1)+(alice.cookie.endsWith("a")?"b":"a");
    assert.equal((await tampered.request("/api/data/bootstrap")).status,401);
  });

  await step("new maps start genuinely empty and a saved profile survives a fresh cookie jar",async()=>{
    const [as,bs]=await Promise.all([alice.ok<Bootstrap>("/api/data/bootstrap"),bob.ok<Bootstrap>("/api/data/bootstrap")]);
    assert.deepEqual(as.concepts,[]);assert.deepEqual(as.events,[]);assert.deepEqual(as.explorers,[]);
    assert.deepEqual(bs.concepts,[]);assert.equal(as.profile.openToMatch,false);
    await alice.ok("/api/data/profile","PATCH",{displayName:`Alice revised ${tag}`,currentIntent:"A private current question",staticProfile:{role:"engineer",background:"Only Alice should receive this",age18Plus:true},openToMatch:true,availableMinutes:20});
    await bob.ok("/api/data/profile","PATCH",{staticProfile:{role:"learner",background:"Only Bob should receive this",age18Plus:true},openToMatch:true,availableMinutes:20});
    const reloaded=new Client();reloaded.cookie=alice.cookie;
    const restored=await reloaded.ok<Bootstrap>("/api/data/bootstrap");
    assert.equal(restored.actorId,a.actorId);assert.equal(restored.profile.displayName,`Alice revised ${tag}`);
    assert.equal(restored.profile.currentIntent,"A private current question");
    const bobState=await bob.ok<Bootstrap>("/api/data/bootstrap");
    assert.equal(bobState.profile.currentIntent,"");assert.equal(bobState.profile.staticProfile.background,"Only Bob should receive this");
    assert.equal((await alice.request("/api/data/profile","PATCH",{id:b.actorId,displayName:"Must not change Bob"})).status,400);
  });

  await step("concept and learning-event retries are idempotent and scoped to their cookie",async()=>{
    for(const who of [alice,bob]) {
      await who.ok("/api/data/concepts","POST",{concept:sharedConcept});
      await who.ok("/api/data/concepts","POST",{concept:sharedConcept});
    }
    await alice.ok("/api/data/concepts","POST",{concept:privateConcept});
    const event={slug:shared,kind:"open",idempotencyKey:`http-open-${tag}`};
    const first=await alice.ok<{event:{id:number}}>("/api/data/events","POST",event);
    const retry=await alice.ok<{event:{id:number}}>("/api/data/events","POST",event);
    assert.equal(first.event.id,retry.event.id);
    const as=await alice.ok<Bootstrap>("/api/data/bootstrap"),bs=await bob.ok<Bootstrap>("/api/data/bootstrap");
    assert.equal(as.events.filter(e=>e.slug===shared&&e.kind==="seed").length,1);
    assert.equal(as.events.filter(e=>e.slug===shared&&e.kind==="open").length,1);
    assert.equal(bs.events.filter(e=>e.kind==="open").length,0);
    assert.equal(bs.concepts.some(x=>x.slug===privateSlug),false);
    assert.equal((await bob.request("/api/data/events","POST",{slug:privateSlug,kind:"watch"})).status,404);
    assert.equal((await alice.request("/api/data/events","POST",{slug:shared,kind:"session"})).status,400);
    assert.equal((await alice.request("/api/data/events","POST",{slug:shared,kind:"explain",payload:{score:3}})).status,400);
  });

  await step("saved concepts become searchable through the real asynchronous local index",async()=>{
    // Source persistence completes before embedding inference. Explicitly resume
    // durable work and wait for it instead of assuming an immediately ready map.
    for(const client of [alice,bob])await client.ok("/api/local/reindex","POST",{});
    const deadline=Date.now()+90_000;
    for(const client of [alice,bob]) {
      for(;;) {
        const {indexing}=await client.ok<{indexing:{pending:number;processing:number;retry:number;ready:number}}>("/api/local/indexing");
        if(indexing.pending+indexing.processing+indexing.retry===0){assert.ok(indexing.ready>0);break;}
        assert.ok(Date.now()<deadline,"Start the real local embedding service before backend HTTP tests");
        await new Promise(resolve=>setTimeout(resolve,250));
      }
    }
    // Indexing can outlast a presence lease; matching starts from fresh presence.
    for(const client of [alice,bob])await client.ok("/api/local/presence","POST");
  });

  await step("presence only exposes the matching projection, with opt-in and time fit",async()=>{
    await alice.ok("/api/local/presence","POST");await bob.ok("/api/local/presence","POST");
    const p=await alice.ok<{explorers:PeerCandidate[]}>("/api/local/presence");
    const peer=p.explorers.find(x=>x.id===b.actorId);assert.ok(peer);
    assert.equal(p.explorers.some(x=>x.id===c.actorId),false);
    for(const field of ["staticProfile","currentIntent","preferences","metadata","media"])assert.equal(field in peer,false);
    await bob.ok("/api/data/profile","PATCH",{availableMinutes:5});
    const unavailable=await alice.ok<MatchResponse>("/api/match","POST",{});
    assert.equal(unavailable.ranked.some(x=>x.peer.id===b.actorId),false);
    await bob.ok("/api/data/profile","PATCH",{availableMinutes:20});
    for(const malformed of [{requestId:randomUUID(),decision:"later"},{requestId:randomUUID()},{decision:"accept"}]) {
      assert.equal((await alice.request("/api/match","POST",malformed)).status,400,`Malformed match input: ${JSON.stringify(malformed)}`);
    }
    assert.deepEqual((await alice.ok<Bootstrap>("/api/data/bootstrap")).invitations,[]);
    const result=await alice.ok<MatchResponse>("/api/match","POST",{});
    assert.ok(result.match,`Expected shared topic match: ${JSON.stringify(result)}`);
    assert.equal(result.match.peer.id,b.actorId);assert.equal(result.demo,false);invite=result.match;
    const bPresence=await bob.ok<{match:MatchRequest|null}>("/api/local/presence");
    assert.equal(bPresence.match?.id,invite.id);
  });

  await step("both accept the exact invitation, and an outsider cannot see the room",async()=>{
    const one=await alice.ok<MatchResponse>("/api/match","POST",{requestId:invite.id,decision:"accept"});
    assert.equal(one.status,"waiting");assert.equal(one.sessionId,undefined);
    assert.equal((await outsider.request(`/api/match?requestId=${invite.id}`)).status,404);
    assert.equal((await outsider.request("/api/match","POST",{requestId:invite.id,decision:"accept"})).status,404);
    const two=await bob.ok<MatchResponse>("/api/match","POST",{requestId:invite.id,decision:"accept"});
    assert.equal(two.status,"accepted");assert.ok(two.sessionId);sid=two.sessionId!;
    const [ap,bp]=await Promise.all([alice.ok<{sessionId:string}>(`/api/match?requestId=${invite.id}`),bob.ok<{sessionId:string}>(`/api/match?requestId=${invite.id}`)]);
    assert.equal(ap.sessionId,sid);assert.equal(bp.sessionId,sid);
    const refreshed=new Client();refreshed.cookie=alice.cookie;
    const restored=await refreshed.ok<Bootstrap>("/api/data/bootstrap");
    assert.equal(restored.currentSessionId,sid);assert.equal(restored.match?.sessionId,sid);
    assert.equal((await outsider.request(`/api/local/sessions/${sid}`)).status,404);
    assert.equal((await outsider.request(`/api/session/${sid}/message`)).status,404);
    await outsider.ok("/api/data/profile","PATCH",{staticProfile:{role:"learner",background:"Third local test persona",age18Plus:true},openToMatch:true});
    await outsider.ok("/api/local/presence","POST");
    const available=await outsider.ok<{explorers:PeerCandidate[]}>("/api/local/presence");
    assert.equal(available.explorers.some(p=>p.id===a.actorId||p.id===b.actorId),false);
    assert.deepEqual((await alice.ok<{explorers:PeerCandidate[]}>("/api/local/presence")).explorers,[]);
    await outsider.ok("/api/data/profile","PATCH",{openToMatch:false});
  });

  await step("human messages persist once and both clients read the same conversation",async()=>{
    const text="Breaking work into independent pieces lets workers run at the same time.";
    const first=await alice.ok(`/api/session/${sid}/message`,"POST",{text,idempotencyKey:`http-a-${tag}`},{"idempotency-key":`http-a-${tag}`});
    assert.equal(first.delivered,true);
    assert.equal(first.demo,true);assert.equal(typeof first.facilitator,"string");assert.equal(first.facilitatorError,undefined);
    await alice.ok(`/api/session/${sid}/message`,"POST",{text,idempotencyKey:`http-a-${tag}`},{"idempotency-key":`http-a-${tag}`});
    assert.equal((await alice.request(`/api/session/${sid}/message`,"POST",{text:"Changed input under the same key",idempotencyKey:`http-a-${tag}`})).status,409);
    const once=await alice.ok<Room>(`/api/local/sessions/${sid}`);
    assert.equal(once.messages.filter(m=>m.who==="facilitator").length,1);
    const reply="And the memory system has to keep supplying those workers.";
    await bob.ok(`/api/session/${sid}/message`,"POST",{text:reply,idempotencyKey:`http-b-${tag}`},{"idempotency-key":`http-b-${tag}`});
    const av=await alice.ok<Room>(`/api/local/sessions/${sid}`),bv=await bob.ok<Room>(`/api/local/sessions/${sid}`);
    assert.equal(av.messages.filter(m=>m.text===text).length,1);
    assert.equal(av.messages.filter(m=>m.text===reply).length,1);
    assert.equal(av.messages.filter(m=>m.who==="facilitator").length,2);
    assert.deepEqual(av.messages.map(m=>m.id),bv.messages.map(m=>m.id));
    assert.equal(av.messages.find(m=>m.text===text)?.who,"me");
    assert.equal(bv.messages.find(m=>m.text===text)?.who,"peer");
    assert.equal((await outsider.request(`/api/session/${sid}/message`,"POST",{text:"I should not enter"})).status,404);
  });

  await step("concurrent completion credits each participant once and persists reload state",async()=>{
    await Promise.all([alice.ok(`/api/session/${sid}/end`,"POST",{}),bob.ok(`/api/session/${sid}/end`,"POST",{})]);
    await alice.ok(`/api/session/${sid}/end`,"POST",{});
    for(const client of [alice,bob]) {
      const s=await client.ok<Bootstrap>("/api/data/bootstrap");
      assert.equal(s.events.filter(e=>e.kind==="session"&&e.payload?.sessionId===sid).length,1);
      assert.equal(s.currentSessionId,null);
      assert.ok(s.sessions.find(x=>x.id===sid)?.endedAt);
    }
    assert.equal((await alice.request(`/api/session/${sid}/message`,"POST",{text:"This room ended"})).status,409);
  });

  await step("persistent block/report prevents a later connection and resists outsiders",async()=>{
    const report=await alice.ok<{status:string;reportIds:string[]}>(`/api/local/sessions/${sid}/report`,"POST",{reason:"HTTP test report; fixture only"});
    assert.equal(report.status,"recorded");assert.equal(report.reportIds.length,1);
    assert.equal((await outsider.request(`/api/local/sessions/${sid}/report`,"POST",{reason:"Not my room"})).status,404);
    assert.equal((await outsider.request(`/api/local/sessions/${sid}/block`,"POST",{})).status,404);
    const next=await alice.ok<MatchResponse>("/api/match","POST",{});
    assert.equal(next.match?.peer.id,b.actorId);const nextId=next.match!.id;
    await alice.ok("/api/match","POST",{requestId:nextId,decision:"accept"});
    const connected=await bob.ok<MatchResponse>("/api/match","POST",{requestId:nextId,decision:"accept"});
    const blockedSid=connected.sessionId!;assert.ok(blockedSid);assert.notEqual(blockedSid,sid);
    await alice.ok(`/api/session/${blockedSid}/message`,"POST",{text:"This is a second room",idempotencyKey:`block-a-${tag}`});
    await bob.ok(`/api/session/${blockedSid}/message`,"POST",{text:"Closing should not reward a blocked conversation",idempotencyKey:`block-b-${tag}`});
    await alice.ok(`/api/local/sessions/${blockedSid}/block`,"POST",{});
    const reloadedBlocked=await bob.ok<Room>(`/api/local/sessions/${blockedSid}`);
    assert.ok(reloadedBlocked.endedAt);assert.equal(reloadedBlocked.blocked,true);
    assert.equal((await alice.ok<Room>(`/api/local/sessions/${sid}`)).blocked,true);
    await bob.ok(`/api/session/${blockedSid}/end`,"POST",{});
    for(const who of [alice,bob]){
      const state=await who.ok<Bootstrap>("/api/data/bootstrap");
      assert.equal(state.currentSessionId,null);
      assert.equal(state.events.filter(e=>e.kind==="session"&&e.payload?.sessionId===blockedSid).length,0);
    }
    assert.equal((await bob.request(`/api/session/${blockedSid}/message`,"POST",{text:"Must not deliver"})).status,409);
    await alice.ok("/api/local/presence","POST");await bob.ok("/api/local/presence","POST");
    const p=await bob.ok<{explorers:PeerCandidate[]}>("/api/local/presence");
    assert.equal(p.explorers.some(x=>x.id===a.actorId),false);
    const result=await bob.ok<MatchResponse>("/api/match","POST",{});
    assert.equal(result.ranked.some(x=>x.peer.id===a.actorId),false);
  });
});

test("HTTP independent agent invocation persists once and rejects changed-input retries",{skip:!base,timeout:120_000},async()=>{
  const health=await (await fetch(base!+"/api/health")).json() as {modelMode?:string};
  assert.equal(health.modelMode,"fixture","HTTP integration must use an isolated fixture-mode server");
  const one=new Client(),two=new Client(),tag=randomUUID().slice(0,8);
  await one.ok("/api/local/identity","POST",{displayName:`Agent owner ${tag}`});
  await two.ok("/api/local/identity","POST",{displayName:`Other agent owner ${tag}`});
  const input={agentId:"metadata",input:{text:"I want to understand GPU memory and parallel work."},idempotencyKey:`metadata-${tag}`};
  const [first,retried]=await Promise.all([one.ok("/api/agents/invoke","POST",input),one.ok("/api/agents/invoke","POST",input)]);
  assert.equal(first.runId,retried.runId);assert.deepEqual(first.data,retried.data);
  assert.equal(first.mode,"fixture");assert.equal(first.persisted,true);
  const durable=await one.ok("/api/agents/invoke","POST",input);
  assert.deepEqual(durable,first);
  const changed={...input,input:{text:"A different request about audio."}};
  assert.equal((await one.request("/api/agents/invoke","POST",changed)).status,409);
  const raceKey=`metadata-race-${tag}`;
  const race=await Promise.all([one.request("/api/agents/invoke","POST",{...input,idempotencyKey:raceKey}),one.request("/api/agents/invoke","POST",{...changed,idempotencyKey:raceKey})]);
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  const other=await two.ok("/api/agents/invoke","POST",input);
  assert.notEqual(other.runId,first.runId);
  const snapshot=await one.ok<Bootstrap>("/api/data/bootstrap"),otherSnapshot=await two.ok<Bootstrap>("/api/data/bootstrap");
  assert.equal(snapshot.metadata.length,2);assert.equal(otherSnapshot.metadata.length,1);
  assert.equal(snapshot.profile.currentIntent,"");assert.equal(snapshot.profile.openToMatch,false);
  assert.equal(otherSnapshot.metadata.some(m=>m.provenance.runId===first.runId),false);
  const preview=await one.ok("/api/agents/invoke","POST",{...input,idempotencyKey:`preview-${tag}`},{"x-further-demo":"true"});
  assert.equal(preview.persisted,false);assert.equal(preview.mode,"fixture");
  assert.equal((await one.ok<Bootstrap>("/api/data/bootstrap")).metadata.length,2);
});

test("HTTP saved map runs restore quest history without another model request",{skip:!base,timeout:120_000},async()=>{
  const health=await(await fetch(base!+"/api/health")).json() as {modelMode?:string};
  assert.equal(health.modelMode,"fixture");
  const owner=new Client(),fresh=new Client(),outsider=new Client(),key=randomUUID();
  await owner.ok("/api/local/identity","POST",{displayName:"Quest verification"});
  await outsider.ok("/api/local/identity","POST",{displayName:"Separate quest owner"});
  const result=await owner.ok<{runId:string;data:{concepts:Array<{slug:string}>}}>("/api/agents/knowledge-map","POST",{input:{text:"Understand database indexes",objective:"expand"},idempotencyKey:key});
  fresh.cookie=owner.cookie;
  type WithMissions=Bootstrap & {missions:Array<{runId:string;text:string;status:string;slugs:string[]}>};
  const restored=await fresh.ok<WithMissions>("/api/data/bootstrap");
  assert.equal(restored.missions.length,1);assert.equal(restored.missions[0].runId,result.runId);
  assert.equal(restored.missions[0].status,"done");assert.equal(restored.missions[0].text,"Understand database indexes");
  assert.deepEqual(restored.missions[0].slugs,result.data.concepts.map(c=>c.slug));
  assert.deepEqual((await outsider.ok<WithMissions>("/api/data/bootstrap")).missions,[]);
});
