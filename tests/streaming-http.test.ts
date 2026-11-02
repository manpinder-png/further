import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { withProgress } from "../domains/backend/streaming.ts";
import { invokeAgent } from "../domains/backend/agents.ts";
import { FixtureAgentModel, AgentError } from "../domains/agents/index.ts";
import { sessionCookie } from "../domains/backend/identity.ts";
import { createRepository } from "../domains/data/repository.ts";
import type { FurtherRepository } from "../domains/data/contracts.ts";
import type { AgentEvent } from "../domains/agents/contracts.ts";
import { POST as generic } from "../app/api/agents/invoke/route.ts";
import { POST as named } from "../app/api/agents/[agentId]/route.ts";
import { POST as expand } from "../app/api/expand/route.ts";
import { POST as teach } from "../app/api/teach/route.ts";
import { POST as course } from "../app/api/course/route.ts";
import { GET as card } from "../app/api/card/[slug]/route.ts";
import { POST as explain } from "../app/api/explain/route.ts";
import { POST as message } from "../app/api/session/[id]/message/route.ts";
import { POST as image } from "../app/api/media/understand/route.ts";
import { POST as transcribe } from "../app/api/transcribe/route.ts";

type Envelope = AgentEvent | {type:"result";result:Record<string,unknown>} | {type:"error";error:string;code?:string};
let repo:FurtherRepository,directory:string,cookie:string;
const actorId=randomUUID(),peerId=randomUUID();
const shared=globalThis as typeof globalThis & {__furtherLocalRepository?:Promise<FurtherRepository>};
const oldFetch=globalThis.fetch;
const originalEnv={local:process.env.FURTHER_LOCAL_DIR,mode:process.env.FURTHER_MODEL_MODE,key:process.env.META_API_KEY};
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),"further-streaming-"));
  process.env.FURTHER_LOCAL_DIR=directory;process.env.FURTHER_MODEL_MODE="fixture";
  repo=await createRepository();shared.__furtherLocalRepository=Promise.resolve(repo);
  for(const id of [actorId,peerId]){
    await repo.ensureUser(id,"Streaming learner");
    await repo.updateProfile(id,{staticProfile:{role:"learner",background:"",age18Plus:true},openToMatch:true});
    await repo.addConcepts(id,[{slug:"gpu",title:"Graphics processors",hook:"Parallel work",domain:"ai-tech"}]);
    await repo.heartbeat(id);
  }
  cookie=sessionCookie(actorId).split(";")[0];
  globalThis.fetch=async()=>{throw new Error("Network is disabled in streaming transport tests");};
});
after(async()=>{
  globalThis.fetch=oldFetch;delete shared.__furtherLocalRepository;
  for(const [key,value] of [["FURTHER_LOCAL_DIR",originalEnv.local],["FURTHER_MODEL_MODE",originalEnv.mode],["META_API_KEY",originalEnv.key]]){
    if(value===undefined)delete process.env[key!];else process.env[key!]=value;
  }
  await repo.close();await rm(directory,{recursive:true,force:true});
});
function request(path:string,payload?:unknown,headers:Record<string,string>={},signal?:AbortSignal){
  return new Request(`http://localhost:3000${path}`,{method:payload===undefined?"GET":"POST",headers:{cookie,accept:"text/event-stream","content-type":"application/json",...headers},...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal});
}
function envelopes(text:string):Envelope[]{return text.split(/\r?\n\r?\n/).flatMap(block=>{
  const data=block.split(/\r?\n/).filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trimStart()).join("\n");
  return data?[JSON.parse(data) as Envelope]:[];
});}
async function consume(response:Response){
  assert.equal(response.status,200);assert.match(response.headers.get("content-type")??"",/^text\/event-stream/);
  const events=envelopes(await response.text());
  assert.equal(events[0]?.type,"activity");
  const progress=events.filter((event):event is AgentEvent=>event.type==="activity"||event.type==="text_delta");
  for(let i=0;i<progress.length;i++)assert.equal(progress[i].sequence,i+1);
  assert.equal(events.filter(event=>event.type==="result").length,1);
  assert.equal(events.filter(event=>event.type==="error").length,0);
  const last=events.at(-1);assert.equal(last?.type,"result");
  return {events,result:(last as Extract<Envelope,{type:"result"}>).result};
}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
function wav(){
  const a=new ArrayBuffer(46),d=new DataView(a);
  const ascii=(at:number,s:string)=>{for(let i=0;i<s.length;i++)d.setUint8(at+i,s.charCodeAt(i));};
  ascii(0,"RIFF");d.setUint32(4,38,true);ascii(8,"WAVE");ascii(12,"fmt ");d.setUint32(16,16,true);
  d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,16000,true);d.setUint32(28,32000,true);d.setUint16(32,2,true);d.setUint16(34,16,true);
  ascii(36,"data");d.setUint32(40,2,true);return new Blob([a],{type:"audio/wav"});
}

test("stream sends accepted activity before slow work and preserves ordered replacement drafts",async()=>{
  const gate=deferred();let finished=false;
  const response=await withProgress(request("/test"),"metadata",async progress=>{
    await gate.promise;
    progress.onEvent?.({type:"text_delta",sequence:700,at:new Date().toISOString(),agentId:"metadata",field:"intent",delta:"Provisional",replace:true});
    progress.activity("saving","Saving the result.");finished=true;return {saved:true};
  });
  const reader=response.body!.getReader(),first=await reader.read();
  assert.equal(finished,false);assert.equal(envelopes(new TextDecoder().decode(first.value))[0]?.type,"activity");
  gate.resolve();let rest="";
  for(;;){const chunk=await reader.read();if(chunk.done)break;rest+=new TextDecoder().decode(chunk.value);}
  const events=envelopes(rest);assert.equal(events[0].type,"text_delta");
  assert.equal((events[0] as Extract<AgentEvent,{type:"text_delta"}>).replace,true);
  assert.equal((events[0] as AgentEvent).sequence,2);assert.equal(events.at(-1)?.type,"result");
});

test("stream errors are safe terminal events; cancellation aborts work without a false final result",async()=>{
  const error=await withProgress(request("/test"),"metadata",async()=>{throw new Error("SECRET provider body must not escape");});
  const raw=await error.text();assert.equal(raw.includes("SECRET"),false);
  const events=envelopes(raw);assert.equal(events.at(-1)?.type,"error");assert.equal(events.some(e=>e.type==="result"),false);
  const started=deferred(),aborted=deferred();
  const pending=await withProgress(request("/test"),"metadata",async progress=>{
    started.resolve();await new Promise<void>(resolve=>{progress.signal.addEventListener("abort",()=>{aborted.resolve();resolve();},{once:true});});return {shouldNotArrive:true};
  });
  const reader=pending.body!.getReader();await reader.read();await started.promise;await reader.cancel();await aborted.promise;
});

test("authorization and malformed inputs remain HTTP JSON errors before opening a stream",async()=>{
  const unauth=await teach(new Request("http://localhost:3000/api/teach",{method:"POST",headers:{accept:"text/event-stream"},body:"{}"}));
  assert.equal(unauth.status,401);assert.match(unauth.headers.get("content-type")??"",/application\/json/);
  const invalid=await generic(request("/api/agents/invoke",{agentId:"metadata",input:{text:""}}));
  assert.equal(invalid.status,400);assert.match(invalid.headers.get("content-type")??"",/application\/json/);
});

test("every text AI route streams the same final public shape and legacy expansion still works",async()=>{
  const demo={"x-further-demo":"true"};
  const calls:Array<[()=>Promise<Response>,string]>=[
    [()=>generic(request("/api/agents/invoke",{agentId:"metadata",input:{text:"Explain parallel work"}},demo)),"data"],
    [()=>named(request("/api/agents/metadata",{input:{text:"Explain parallel work"}},demo),{params:Promise.resolve({agentId:"metadata"})}),"data"],
    [()=>teach(request("/api/teach",{slug:"gpu"},demo)),"body"],
    [()=>course(request("/api/course",{slug:"gpu"},demo)),"lessons"],
    [()=>card(request("/api/card/gpu",undefined,demo),{params:Promise.resolve({slug:"gpu"})}),"hook"],
    [()=>explain(request("/api/explain",{slug:"gpu",transcript:"Many operations at once"},demo)),"feedback"],
    [()=>expand(request("/api/expand",{text:"How do processors work?"},demo)),"lines"],
  ];
  for(const [call,field] of calls){const {events,result}=await consume(await call());assert.ok(field in result);assert.ok(events.length>=3);}
  const legacy=await expand(request("/api/expand",{text:"How do processors work?"},{...demo,accept:"application/json"}));
  const lines=envelopes(await legacy.text()) as unknown as Array<{type:string}>;
  assert.equal(lines[0].type,"intent");assert.equal(lines.at(-1)?.type,"done");
  const jsonResponse=await teach(request("/api/teach",{slug:"gpu"},{...demo,accept:"application/json"}));
  assert.match(jsonResponse.headers.get("content-type")??"",/application\/json/);assert.ok((await jsonResponse.json()).body);
});

test("image and audio uploads stream checked-upload status and preserve fixture provenance",async()=>{
  const photo=new FormData();
  photo.append("image",new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2U0AAAAASUVORK5CYII=","base64")],{type:"image/png"}),"pixel.png");
  const picture=await consume(await image(new Request("http://localhost:3000/api/media/understand",{method:"POST",headers:{cookie,accept:"text/event-stream","x-further-demo":"true"},body:photo})));
  assert.equal(picture.result.demo,true);assert.ok(picture.result.text);assert.equal(picture.result.mediaId,undefined);
  assert.ok(picture.events.some(e=>e.type==="activity"&&e.label.includes("upload received")));
  const recording=new FormData();recording.append("audio",wav(),"clip.wav");
  const voice=await consume(await transcribe(new Request("http://localhost:3000/api/transcribe",{method:"POST",headers:{cookie,accept:"text/event-stream"},body:recording})));
  assert.equal(voice.result.mode,"fixture");assert.equal(voice.events.some(e=>e.type==="text_delta"),false);
});

test("coalesced subscribers share real progress; one cancellation does not cancel the other",async()=>{
  const gate=deferred(),entered=deferred(),original=repo.getAgentRun.bind(repo);
  const complete=FixtureAgentModel.prototype.complete;let modelCalls=0;
  FixtureAgentModel.prototype.complete=async function(input){modelCalls++;return complete.call(this,input);};
  repo.getAgentRun=async(...args)=>{entered.resolve();await gate.promise;return original(...args);};
  const firstAbort=new AbortController(),events:AgentEvent[]=[];
  const key=`subscribers-${randomUUID()}`;
  try{
    const first=invokeAgent(actorId,"metadata",{text:"Share this request"},{idempotencyKey:key,signal:firstAbort.signal,onEvent:()=>undefined});
    const rejection=assert.rejects(first,/cancelled/);
    await entered.promise;
    const second=invokeAgent(actorId,"metadata",{text:"Share this request"},{idempotencyKey:key,onEvent:event=>events.push(event)});
    firstAbort.abort();gate.resolve();await rejection;
    const result=await second;assert.equal(result.persisted,true);
    assert.equal(modelCalls,1);
    assert.ok(events.some(e=>e.type==="activity"&&e.phase==="waiting"));
    assert.ok(events.some(e=>e.type==="activity"&&e.phase==="saving"));
    const replay:AgentEvent[]=[];
    const restored=await invokeAgent(actorId,"metadata",{text:"Share this request"},{idempotencyKey:key,onEvent:event=>replay.push(event)});
    assert.equal(restored.runId,result.runId);assert.equal(replay.length,1);
    assert.equal(modelCalls,1);
    assert.equal(replay[0].type,"activity");assert.match((replay[0] as Extract<AgentEvent,{type:"activity"}>).label,/Restored/);
  }finally{gate.resolve();repo.getAgentRun=original;FixtureAgentModel.prototype.complete=complete;}
});

test("disconnecting the last subscriber aborts the provider request",async()=>{
  const entered=deferred(),aborted=deferred(),complete=FixtureAgentModel.prototype.complete;
  FixtureAgentModel.prototype.complete=async request=>{
    entered.resolve();
    return new Promise((_resolve,reject)=>{
      const stop=()=>{aborted.resolve();reject(new AgentError("CANCELLED","Provider request cancelled."));};
      if(request.signal.aborted)stop();else request.signal.addEventListener("abort",stop,{once:true});
    });
  };
  try{
    const controller=new AbortController();
    const run=invokeAgent(actorId,"metadata",{text:"Cancel this request"},{idempotencyKey:randomUUID(),signal:controller.signal,onEvent:()=>undefined});
    const rejected=assert.rejects(run,/cancelled/);
    await entered.promise;controller.abort();await rejected;await aborted.promise;
  }finally{FixtureAgentModel.prototype.complete=complete;}
});

test("shared-room stream acknowledges durable human delivery even if the facilitator fails",async()=>{
  const invite=await repo.invite(actorId,peerId,"gpu");await repo.respondToInvite(actorId,invite.id,"accept");
  const accepted=await repo.respondToInvite(peerId,invite.id,"accept"),id=accepted.sessionId!;
  process.env.FURTHER_MODEL_MODE="live";delete process.env.META_API_KEY;
  try{
    const {events,result}=await consume(await message(request(`/api/session/${id}/message`,{text:"My explanation is saved",idempotencyKey:randomUUID()}),{params:Promise.resolve({id})}));
    assert.equal(result.delivered,true);assert.equal(typeof result.facilitatorError,"string");
    assert.ok(events.some(e=>e.type==="activity"&&e.label.includes("message is saved")));
    assert.equal((await repo.getSession(actorId,id)).messages.filter(m=>m.kind==="human").length,1);
  }finally{process.env.FURTHER_MODEL_MODE="fixture";await repo.completeSession(actorId,id);}
});
