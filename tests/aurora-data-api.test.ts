import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { compileStatement, createAuroraDataApiDatabase, retryRejectedDataRequest, splitStatements } from "../domains/data/aurora-data-api.ts";
import { sqlJson, sqlUuid } from "../domains/data/sql.ts";
import { createRepository } from "../domains/data/repository.ts";

test("Data API positional parameters preserve literals, comments, JSON and arrays", () => {
  const query = compileStatement(`SELECT $1,$1,'$2',"$3",$$literal $4;$$,$body$ $5 $body$, $2::vector, $3::uuid[], $4 -- $99\n/* $99 */`, ["value",sqlJson([1,2]),["one",'two"three'],sqlJson({goal:"learn"})]);
  assert.match(query.sql,/SELECT :p1,:p1,'\$2',"\$3"/);
  assert.match(query.sql,/CAST\(:p2 AS vector\)/);
  assert.match(query.sql,/CAST\(:p4 AS jsonb\)/);
  assert.equal(query.parameters.length,4);
  assert.equal(query.parameters[2].value?.stringValue,'{"one","two\\"three"}');
  const id=randomUUID(),identity=compileStatement("SELECT $1::uuid,$2::text",[sqlUuid(id),id]);
  assert.equal(identity.parameters[0].typeHint,"UUID");
  assert.equal(identity.parameters[1].typeHint,undefined,"UUID-looking text does not become a database UUID");
  assert.throws(()=>compileStatement("SELECT $2",[1]),/parameter is missing/);
  assert.throws(()=>compileStatement("SELECT $1",[Infinity]),/outside the supported range/);
  assert.throws(()=>compileStatement("SELECT $1",[9007199254740992]),/outside the supported range/);
  assert.equal(splitStatements("SELECT ';'; DO $$ BEGIN PERFORM 1; END $$; -- tail\nSELECT 2").length,3);
  assert.equal(splitStatements("/* outer /* nested */ end */; -- trailing comment").length,0);
});

test("Data API allows a bounded long cold resume without retrying unknown outcomes",async()=>{
  const resuming=Object.assign(new Error("cancelled before execution"),{name:"DatabaseResumingException"});
  const waits:number[]=[];let attempts=0;
  assert.equal(await retryRejectedDataRequest(async()=>{if(++attempts<=5)throw resuming;return "ready";},async ms=>{waits.push(ms);}),"ready");
  assert.equal(waits.reduce((sum,value)=>sum+value,0),30_000,"resume remains retryable beyond the old 18s budget");
  attempts=0;waits.length=0;
  await assert.rejects(retryRejectedDataRequest(async()=>{attempts++;throw resuming;},async ms=>{waits.push(ms);}),error=>error===resuming);
  assert.equal(attempts,7);assert.equal(waits.reduce((sum,value)=>sum+value,0),45_000);
  const unavailable=Object.assign(new Error("outcome unknown"),{name:"DatabaseUnavailableException"});
  attempts=0;waits.length=0;
  await assert.rejects(retryRejectedDataRequest(async()=>{attempts++;throw unavailable;},async ms=>{waits.push(ms);}),error=>error===unavailable);
  assert.equal(attempts,1);assert.equal(waits.length,0);
});

test("Data API retries explicit rejected throttles with bounded jitter, never arbitrary retryable failures",async()=>{
  for(const name of ["ThrottlingException","TooManyRequestsException"]){
    const throttle=Object.assign(new Error("Rate exceeded"),{name}),waits:number[]=[];
    let attempts=0;
    assert.equal(await retryRejectedDataRequest(async()=>{if(++attempts<3)throw throttle;return "ready";},async ms=>{waits.push(ms);},()=>0.5),"ready");
    assert.deepEqual(waits,[500,1000]);
    attempts=0;waits.length=0;
    await assert.rejects(retryRejectedDataRequest(async()=>{attempts++;throw throttle;},async ms=>{waits.push(ms);},()=>0.999),error=>error===throttle);
    assert.equal(attempts,6);assert.equal(waits.length,5);assert.ok(waits.reduce((sum,value)=>sum+value,0)<23_000);
  }
  for(const name of ["TimeoutError","InternalServerErrorException","DatabaseUnavailableException"]){
    let attempts=0;
    const uncertain=Object.assign(new Error("Outcome unknown"),{name,$retryable:{}});
    await assert.rejects(retryRejectedDataRequest(async()=>{attempts++;throw uncertain;},async()=>{assert.fail("uncertain requests must not be replayed");}),error=>error===uncertain);
    assert.equal(attempts,1);
  }
});

/** Execute the generated SQL against real pgvector/PGlite rather than matching query strings. */
async function transport() {
  const pg=await PGlite.create({extensions:{vector}});
  const operations:string[]=[];
  const client={async send(command:{constructor:{name:string};input:Record<string,unknown>}) {
    operations.push(command.constructor.name);
    if(command.constructor.name==="BeginTransactionCommand"){await pg.exec("BEGIN");return {transactionId:"test-transaction"};}
    if(command.constructor.name==="CommitTransactionCommand"){await pg.exec("COMMIT");return {};}
    if(command.constructor.name==="RollbackTransactionCommand"){await pg.exec("ROLLBACK");return {};}
    const input=command.input;
    const parameters=(input.parameters??[]) as Array<{name:string;typeHint?:string;value:Record<string,unknown>}>;
    const converted:unknown[]=[];
    const statement=String(input.sql).replace(/:p(\d+)\b/g,(_,n:string)=>{
      const binding=parameters.find(p=>p.name===`p${n}`)!,parameter=binding.value;
      converted.push(parameter.isNull?null:parameter.stringValue??parameter.longValue??parameter.doubleValue??parameter.booleanValue);
      // Model the Data API/JDBC parameter types instead of PGlite's convenient
      // unknown-parameter inference, so missing UUID/array casts fail locally.
      const type=binding.typeHint==="UUID"?"uuid":parameter.stringValue!==undefined?"varchar":parameter.longValue!==undefined?"bigint":parameter.doubleValue!==undefined?"double precision":undefined;
      return type?`CAST($${converted.length} AS ${type})`:`$${converted.length}`;
    });
    const result=await pg.query<Record<string,unknown>>(statement,converted);
    return {
      numberOfRecordsUpdated:result.affectedRows,
      columnMetadata:result.fields.map(field=>({name:field.name,typeName:field.dataTypeID===3802?"jsonb":undefined})),
      records:result.rows.map(row=>result.fields.map(field=>{
        const value=row[field.name];
        if(value===null||value===undefined)return {isNull:true};
        if(typeof value==="boolean")return {booleanValue:value};
        if(typeof value==="number")return Number.isInteger(value)?{longValue:value}:{doubleValue:value};
        return {stringValue:typeof value==="string"?value:JSON.stringify(value)};
      })),
    };
  }};
  const db=createAuroraDataApiDatabase({region:"us-east-1",resourceArn:"arn:aws:rds:us-east-1:123456789012:cluster:test",secretArn:"arn:aws:secretsmanager:us-east-1:123456789012:secret:test",database:"further",client:client as never});
  return {db,pg,operations};
}

test("Data API cursor paging reconstructs large JSON rows and preserves rollback",async()=>{
  const {db,pg,operations}=await transport();
  try{
    await db.exec("CREATE TABLE test_rows(id int PRIMARY KEY,document jsonb,tags uuid[])");
    const id=randomUUID(),body="Multibyte learning evidence "+"αβγδ".repeat(40_000);
    await db.query("INSERT INTO test_rows(id,document,tags) VALUES($1,$2,$3::uuid[])",[1,sqlJson({body}),[id]]);
    const data=await db.query<{id:number;document:{body:string};tags:string[]}>("SELECT * FROM test_rows ORDER BY id");
    assert.deepEqual(data.rows,[{id:1,document:{body},tags:[id]}]);
    assert.ok(operations.filter(name=>name==="ExecuteStatementCommand").length>5,"large result really needs multiple bounded fetches");
    await assert.rejects(db.transaction(async tx=>{await tx.query("INSERT INTO test_rows(id) VALUES($1)",[2]);throw new Error("expected abort");}),/expected abort|could not finish/);
    assert.equal((await db.query("SELECT * FROM test_rows WHERE id=$1",[2])).rows.length,0);
    await assert.rejects(db.query("SELECT 9007199254740993::bigint AS unsafe_integer"),error=>(error as {code?:string}).code==="DATA_NUMBER_RANGE");
  }finally{await pg.close();}
});

test("Data API serializes one transaction without serializing independent transactions",async()=>{
  const active=new Set<string>();
  let nextId=0,maxParallel=0;
  const client={async send(command:{constructor:{name:string};input:Record<string,unknown>}) {
    if(command.constructor.name==="BeginTransactionCommand")return {transactionId:`tx-${++nextId}`};
    const id=String(command.input.transactionId);
    if(command.constructor.name!=="ExecuteStatementCommand"){
      assert.equal(active.has(id),false,"commit/rollback waits until its requests settle");return {};
    }
    assert.equal(active.has(id),false,"requests in one transaction cannot overlap");
    active.add(id);maxParallel=Math.max(maxParallel,active.size);
    await new Promise(resolve=>setTimeout(resolve,10));active.delete(id);
    return {columnMetadata:[{name:"r"},{name:"n"},{name:"j"}],records:[[{stringValue:"1"},{stringValue:"0"},{stringValue:'{"value":1}'}]]};
  }};
  const db=createAuroraDataApiDatabase({region:"us-east-1",resourceArn:"arn:aws:rds:us-east-1:123456789012:cluster:test",secretArn:"arn:aws:secretsmanager:us-east-1:123456789012:secret:test",database:"further",client:client as never});
  await db.transaction(tx=>Promise.all([tx.query("SELECT 1 AS value"),tx.query("SELECT 1 AS value")]));
  await Promise.all([db.transaction(tx=>tx.query("SELECT 1 AS value")),db.transaction(tx=>tx.query("SELECT 1 AS value"))]);
  assert.ok(maxParallel>=2,"independent transactions keep request concurrency");
});

test("existing repository graph, jobs, vectors and Cognito identity work through the Data API port",async()=>{
  const {db,pg}=await transport();
  const repo=await createRepository({database:db});
  try{
    const alice=await repo.auth.createExternalAccount({provider:"cognito",subject:"pool-subject-alice",email:"alice@example.test",displayName:"Alice",emailVerified:true,username:"alice"});
    assert.equal((await repo.auth.externalAccount("cognito","pool-subject-alice"))?.learnerId,alice.learnerId);
    assert.equal((await repo.auth.createExternalAccount({provider:"cognito",subject:"pool-subject-alice",email:"changed@example.test",displayName:"Changed",emailVerified:true})).id,alice.id);
    await assert.rejects(repo.auth.createExternalAccount({provider:"cognito",subject:"different-subject",email:"alice@example.test",displayName:"Other",emailVerified:true}),/already registered/);
    await repo.addConcepts(alice.learnerId,[{slug:"semantic-space",title:"Semantic vectors",hook:"Representing related meanings with nearby numeric vectors.",domain:"ai-tech"}]);
    await repo.updateProfile(alice.learnerId,{currentIntent:"Understand semantic similarity"});
    const snapshot=await repo.getSnapshot(alice.learnerId);
    assert.equal(snapshot.concepts[0].slug,"semantic-space");
    await assert.rejects(repo.addConcepts(alice.learnerId,[{slug:"invalid_slug",title:"Invalid"}]),/Invalid concept/,"domain validation survives Data API rollback");
    const {EMBEDDING_SPACE}=await import("../domains/retrieval/space.ts");
    const jobs=await repo.claimIndexJobs(alice.learnerId,EMBEDDING_SPACE,16);
    assert.equal(jobs.length,2);
    for(const job of jobs)assert.equal(await repo.completeIndexJob(alice.learnerId,job.id,job.leaseToken!,[1,...new Array(767).fill(0)]),true);
    const results=await repo.searchVectors(alice.learnerId,[1,...new Array(767).fill(0)],{...EMBEDDING_SPACE});
    assert.equal(results.length,2);assert.equal(results[0].similarity,1);
    const vectorRows=await repo.getOwnedVectors(alice.learnerId,EMBEDDING_SPACE);
    assert.equal(vectorRows[0].vector.length,768);
    await repo.auth.createSession("a".repeat(64),alice.id,Date.now()+60_000);
    assert.equal((await repo.auth.sessionAccount("a".repeat(64)))?.id,alice.id);
  }finally{await pg.close();}
});

test("Data API typed parameters and returned arrays preserve a real shared room",async()=>{
  const {db,pg}=await transport(),repo=await createRepository({database:db});
  try{
    const a=randomUUID(),b=randomUUID(),topic={slug:"shared-topic",title:"Shared learning",hook:"Explaining an idea together."};
    for(const id of [a,b]){
      await repo.ensureUser(id,"Synthetic learner");
      await repo.updateProfile(id,{staticProfile:{role:"learner",background:"private",age18Plus:true},openToMatch:true});
      await repo.addConcepts(id,[topic]);await repo.heartbeat(id);
    }
    assert.equal((await repo.listCandidates(a))[0].id,b);
    const invite=await repo.invite(a,b,topic.slug);
    assert.deepEqual((await repo.respondToInvite(a,invite.id,"accept")).acceptedBy,[a]);
    const accepted=await repo.respondToInvite(b,invite.id,"accept");
    assert.equal(accepted.status,"accepted");assert.ok(accepted.sessionId);
    await repo.appendMessage(a,accepted.sessionId!,"One explanation",{idempotencyKey:"a-one"});
    await repo.appendMessage(b,accepted.sessionId!,"A second explanation",{idempotencyKey:"b-one"});
    await repo.completeSession(a,accepted.sessionId!,["An exchange of ideas"]);
    assert.equal((await repo.getSnapshot(a)).events.filter(event=>event.kind==="session").length,1);
    const run=await repo.beginAgentRun({id:randomUUID(),actorId:a,agentId:"knowledge-map",input:{topic:topic.slug}});
    await repo.finishAgentRun(a,run.id,{output:{ok:true}});
    assert.equal((await repo.getAgentRun(a,run.id))?.output?.ok,true);
    const media=await repo.saveMedia({actorId:a,kind:"image",mimeType:"image/png",localPath:"s3://private-synthetic/media",contentHash:"synthetic",byteSize:10});
    assert.equal((await repo.getMedia(a,media.id)).actorId,a);
    await repo.report(a,b,"Synthetic acceptance report",accepted.sessionId!);
    await repo.block(a,b);assert.equal(await repo.isBlocked(a,b),true);
  }finally{await pg.close();}
});

test("Data API OAuth state survives persistence, is consumed once, and enforces attempt limits",async()=>{
  const {db,pg}=await transport(),repo=await createRepository({database:db});
  try{
    const key="synthetic-oauth-attempt";
    const attempts=await Promise.all([repo.auth.attempt(key,1,60_000),repo.auth.attempt(key,1,60_000)]);
    assert.equal(attempts.filter(attempt=>attempt.allowed).length,1);
    await repo.auth.clearAttempts(key);assert.equal((await repo.auth.attempt(key,1,60_000)).allowed,true);
    const transaction={stateHash:"a".repeat(64),verifier:"synthetic-pkce-verifier",nonce:"synthetic-nonce",redirectUri:"http://127.0.0.1:3000/api/auth/cognito/callback",expiresAt:Date.now()+60_000};
    await repo.auth.saveOAuth(transaction);
    assert.deepEqual(await repo.auth.consumeOAuth(transaction.stateHash),transaction);
    assert.equal(await repo.auth.consumeOAuth(transaction.stateHash),null);
    await repo.auth.saveOAuth({...transaction,expiresAt:Date.now()-1});
    assert.equal(await repo.auth.consumeOAuth(transaction.stateHash),null);
  }finally{await pg.close();}
});
