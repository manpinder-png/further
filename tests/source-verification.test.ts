import { test } from "node:test";
import assert from "node:assert/strict";
import { verifySourceLink } from "../domains/backend/source-verification.ts";

test("documented source publishers are checked, while arbitrary addresses never cause a fetch",async()=>{
  const seen:string[]=[];
  const transport:typeof fetch=async input=>{seen.push(String(input));return new Response(null,{status:200});};
  for(const url of ["https://www.ibm.com/think/topics/context-window","https://docs.nvidia.com/cuda/","https://docs.pytorch.org/docs/stable/"]){
    const result=await verifySourceLink(url,{fetch:transport});assert.equal(result.state,"reachable");assert.equal(result.ok,true);
  }
  const n=seen.length;
  for(const url of ["http://www.ibm.com/a","https://127.0.0.1/a","https://www.ibm.com.evil.example/a","https://www.ibm.com@127.0.0.1/a","https://www.ibm.com:8443/a","https://someone.github.io/a","https://unknown.example/a"]){
    const result=await verifySourceLink(url,{fetch:transport});assert.equal(result.state,"unchecked");assert.equal(result.ok,false);
  }
  assert.equal(seen.length,n);
});

test("redirect targets are checked before fetching and credentials are never accepted",async()=>{
  const seen:string[]=[];
  const transport:typeof fetch=async input=>{seen.push(String(input));return new Response(null,{status:302,headers:{location:"http://127.0.0.1:3000/private"}});};
  const result=await verifySourceLink("https://www.ibm.com/a",{fetch:transport});
  assert.equal(result.state,"unchecked");assert.equal(seen.length,1);
  assert.equal((await verifySourceLink("https://user:secret@www.ibm.com/a",{fetch:transport})).state,"unchecked");
  assert.equal(seen.length,1);
});

test("a safe relative redirect can be followed, but the total check is bounded",async()=>{
  let calls=0;
  const moved=await verifySourceLink("https://www.ibm.com/old",{fetch:async input=>{
    calls++;return String(input).endsWith("/old")?new Response(null,{status:301,headers:{location:"/new"}}):new Response(null,{status:200});
  }});
  assert.equal(moved.state,"reachable");assert.equal(calls,2);
  calls=0;
  const loop=await verifySourceLink("https://www.ibm.com/a",{fetch:async()=>{calls++;return new Response(null,{status:302,headers:{location:"/a"}});}});
  assert.equal(loop.state,"unchecked");assert.equal(calls,4);
});

test("unsupported HEAD falls back to a bounded GET and an inconclusive response is not a broken source",async()=>{
  const methods:string[]=[];
  const result=await verifySourceLink("https://www.ibm.com/a",{fetch:async(_input,init)=>{
    methods.push(init?.method??"");
    if(init?.method==="HEAD")return new Response(null,{status:405});
    assert.equal(new Headers(init?.headers).get("range"),"bytes=0-1023");return new Response("page",{status:206});
  }});
  assert.deepEqual(methods,["HEAD","GET"]);assert.equal(result.state,"reachable");
  for(const status of [403,429,500]) assert.equal((await verifySourceLink("https://www.ibm.com/a",{fetch:async()=>new Response(null,{status})})).state,"unchecked");
  for(const status of [404,410]) assert.equal((await verifySourceLink("https://www.ibm.com/a",{fetch:async()=>new Response(null,{status})})).state,"unavailable");
  assert.equal((await verifySourceLink("https://www.ibm.com/a",{fetch:async()=>{throw new Error("private transport error");}})).message.includes("private"),false);
});

test("video metadata uses the fixed provider endpoint and excludes untrusted thumbnail URLs",async()=>{
  const result=await verifySourceLink("https://youtu.be/abcdefghijk",{fetch:async(input,init)=>{
    assert.equal(new URL(String(input)).origin,"https://www.youtube.com");assert.equal(init?.redirect,"error");
    return Response.json({title:"An explanation",author_name:"Author",thumbnail_url:"http://127.0.0.1/private"});
  }});
  assert.equal(result.state,"reachable");assert.equal(result.title,"An explanation");assert.equal(result.thumbnail,undefined);
});
