import { test } from "node:test";
import assert from "node:assert/strict";
import { learningEvidence } from "../domains/agents/evidence.ts";
import type { FEvent } from "../lib/types.ts";

test("model context separates observations, the latest explanation and participation without peer/private data", () => {
  const events:FEvent[]=[
    {id:1,slug:"context",kind:"open",at:1000},
    {id:2,slug:"context",kind:"explain",at:2000,payload:{score:3,feedback:"You described the mechanism.",runId:"private-run"}},
    {id:3,slug:"context",kind:"session",at:3000,payload:{with:"private-peer-id",sessionId:"private-room"}},
    {id:4,slug:"other",kind:"explain",at:4000,payload:{score:3,feedback:"unrelated private feedback"}},
    {id:5,slug:"context",kind:"explain",at:5000,payload:{score:1,feedback:"Name what moves between the steps."}},
    {id:6,slug:"context",kind:"explain",at:6000,payload:{score:99,feedback:"invalid legacy grade"}},
  ];
  const result=learningEvidence([{slug:"context",title:"Context windows"}],events);
  assert.equal(result.concepts[0].peerSessions,1);
  assert.equal(result.concepts[0].explanationAttempts,2);
  assert.equal(result.concepts[0].latestExplanation?.score,1);
  assert.equal(result.concepts[0].latestExplanation?.at,new Date(5000).toISOString());
  assert.equal(result.concepts[0].latestExplanation?.feedback,"Name what moves between the steps.");
  assert.equal("mastery" in result.concepts[0],false);
  const encoded=JSON.stringify(result);
  assert.equal(encoded.includes("private-"),false);
  assert.equal(encoded.includes("unrelated private feedback"),false);
  assert.equal(encoded.includes("invalid legacy grade"),false);
});

test("empty evidence remains unknown and bounded instead of promoting activity to understanding",()=>{
  const result=learningEvidence([{slug:"new",title:"New topic"}],[]);
  assert.equal(result.concepts[0].latestExplanation,null);
  assert.equal(result.concepts[0].opened,false);
  assert.equal(result.concepts[0].lastActivityAt,null);
  assert.equal(learningEvidence(Array.from({length:120},(_,i)=>({slug:`c-${i}`,title:`Concept ${i}`})),[]).concepts.length,100);
});
