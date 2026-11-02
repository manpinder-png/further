import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { createRepository } from "../domains/data/repository.ts";
import type { FurtherRepository } from "../domains/data/contracts.ts";
import { verifyCognitoTokens, COGNITO_ACCESS_COOKIE } from "../domains/backend/cognito-auth.ts";
import { cognitoConfig, type CognitoConfig } from "../domains/backend/cognito-config.ts";
import { POST as signup } from "../app/api/auth/signup/route.ts";
import { POST as login } from "../app/api/auth/login/route.ts";
import { POST as confirmSignup } from "../app/api/auth/confirm/route.ts";
import { POST as resend } from "../app/api/auth/resend/route.ts";
import { POST as logout } from "../app/api/auth/logout/route.ts";
import { GET as session } from "../app/api/auth/session/route.ts";
import { GET as start } from "../app/api/auth/cognito/start/route.ts";
import { GET as callback } from "../app/api/auth/cognito/callback/route.ts";
import { POST as presence } from "../app/api/local/presence/route.ts";

const config: CognitoConfig = { region: "us-east-1", userPoolId: "us-east-1_TestPool", clientId: "testclient123", issuer: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool", domain: "https://further-test.auth.us-east-1.amazoncognito.com", facebookConfigured: true };
const environment = ["FURTHER_AUTH_PROVIDER", "FURTHER_COGNITO_USER_POOL_ID", "FURTHER_COGNITO_CLIENT_ID", "FURTHER_COGNITO_DOMAIN", "FURTHER_COGNITO_FACEBOOK_CONFIGURED", "FURTHER_AWS_REGION", "FURTHER_ENABLE_LOCAL_PROFILES"].map(key=>[key,process.env[key]] as const);
const originalFetch = globalThis.fetch;
const shared = globalThis as typeof globalThis & { __furtherLocalRepository?: Promise<FurtherRepository> };
let repo: FurtherRepository, privateKey: CryptoKey, keys: JWTVerifyGetKey, publicJwk: Record<string,unknown>;
let nonce: string | undefined, verified = true, failure: string | undefined;
const subject = "cognito-test-subject";
const calls: string[] = [];
function req(path: string, method = "GET", data?: unknown, cookie = "", extra: Record<string,string> = {}) { return new Request(`http://127.0.0.1:3000${path}`, { method, headers: { "content-type":"application/json",cookie,...extra }, ...(data === undefined ? {} : {body:JSON.stringify(data)}) }); }
async function tokens(options: {id?:Record<string,unknown>;access?:Record<string,unknown>;nonce?:string} = {}) {
  const now = Math.floor(Date.now()/1000);
  const identity = { sub:subject,email:"cognito@example.test",email_verified:verified,name:"Cognito learner",preferred_username:"cognito_learner",token_use:"id",...(options.nonce ? {nonce:options.nonce}:{}),iss:config.issuer,aud:config.clientId,iat:now,exp:now+300,...options.id };
  const access = { sub:subject,token_use:"access",client_id:config.clientId,scope:"aws.cognito.signin.user.admin",iss:config.issuer,iat:now,exp:now+300,...options.access };
  return { idToken:await new SignJWT(identity).setProtectedHeader({alg:"RS256",kid:"test-key"}).sign(privateKey),accessToken:await new SignJWT(access).setProtectedHeader({alg:"RS256",kid:"test-key"}).sign(privateKey) };
}
function cookies(response:Response) { return response.headers.getSetCookie().map(value=>value.split(";")[0]).join("; "); }
before(async()=>{
  process.env.FURTHER_AUTH_PROVIDER="cognito";process.env.FURTHER_AWS_REGION=config.region;process.env.FURTHER_COGNITO_USER_POOL_ID=config.userPoolId;process.env.FURTHER_COGNITO_CLIENT_ID=config.clientId;process.env.FURTHER_COGNITO_DOMAIN=config.domain;process.env.FURTHER_COGNITO_FACEBOOK_CONFIGURED="true";process.env.FURTHER_ENABLE_LOCAL_PROFILES="1";
  const pair=await generateKeyPair("RS256");privateKey=pair.privateKey;publicJwk={...await exportJWK(pair.publicKey),kid:"test-key",alg:"RS256",use:"sig"};keys=createLocalJWKSet({keys:[publicJwk]});
  repo=await createRepository();shared.__furtherLocalRepository=Promise.resolve(repo);
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.endsWith("/.well-known/jwks.json")){calls.push("jwks");return Response.json({keys:[publicJwk]});}
    if(url===`${config.domain}/oauth2/token`){calls.push("token-exchange");const form=new URLSearchParams(String(init?.body));assert.equal(form.get("client_id"),config.clientId);assert.match(form.get("code_verifier")??"",/^[A-Za-z0-9_-]{64}$/);const t=await tokens({nonce});return Response.json({access_token:t.accessToken,id_token:t.idToken,refresh_token:"MUST_NOT_BE_RETAINED"});}
    assert.equal(url,`https://cognito-idp.${config.region}.amazonaws.com/`);
    const operation=new Headers(init?.headers).get("x-amz-target")?.split(".").at(-1)??"";calls.push(operation);
    const body=JSON.parse(String(init?.body));assert.equal(body.ClientId,config.clientId);
    if(failure)return Response.json({__type:failure,message:"PRIVATE PROVIDER ERROR CONTENT"},{status:400});
    if(operation==="SignUp")return Response.json({UserConfirmed:false,UserSub:subject,CodeDeliveryDetails:{Destination:"c***@example.test"}});
    if(operation==="InitiateAuth"){const t=await tokens();return Response.json({AuthenticationResult:{AccessToken:t.accessToken,IdToken:t.idToken,RefreshToken:"MUST_NOT_BE_RETAINED"}});}
    return Response.json({});
  };
});
after(async()=>{globalThis.fetch=originalFetch;delete shared.__furtherLocalRepository;await repo.close();for(const[key,value]of environment){if(value===undefined)delete process.env[key];else process.env[key]=value;}});

test("Cognito JWT verification rejects wrong issuer, audience, purpose, subject, expiry and nonce",async()=>{
  const valid=await tokens({nonce:"expected"});const identity=await verifyCognitoTokens(valid,{keys,config,nonce:"expected"});assert.equal(identity.subject,subject);assert.equal(identity.emailVerified,true);
  for(const options of [{id:{iss:"https://unrelated.example"}},{id:{aud:"other-client"}},{id:{token_use:"access"}},{access:{token_use:"id"}},{access:{client_id:"other-client"}},{access:{sub:"another-person"}},{access:{exp:1}},{id:{exp:1}}])await assert.rejects(()=>tokens(options).then(value=>verifyCognitoTokens(value,{keys,config})),/could not verify/);
  await assert.rejects(()=>verifyCognitoTokens(valid,{keys,config,nonce:"forged"}),/could not verify/);
});

test("Cognito signup requires email confirmation and does not create an app account or expose provider bodies",async()=>{
  const response=await signup(req("/api/auth/signup","POST",{email:"cognito@example.test",username:"cognito_learner",displayName:"Cognito learner",password:"Synthetic password 42!"}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.authenticated,false);assert.equal(data.confirmationRequired,true);assert.equal(response.headers.get("set-cookie"),null);assert.equal(await repo.auth.externalAccount("cognito",subject),null);
  failure="UserNotConfirmedException";const denied=await login(req("/api/auth/login","POST",{email:"cognito@example.test",password:"Synthetic password 42!"}));assert.equal(denied.status,403);const body=await denied.json();assert.equal(body.code,"EMAIL_CONFIRMATION_REQUIRED");assert.equal(JSON.stringify(body).includes("PRIVATE"),false);failure=undefined;
  assert.equal((await confirmSignup(req("/api/auth/confirm","POST",{email:"cognito@example.test",code:"123456"}))).status,200);
  assert.equal((await resend(req("/api/auth/resend","POST",{email:"cognito@example.test"}))).status,200);
});

test("Cognito login binds the signed access token to a revocable, expiry-capped account session",async()=>{
  verified=false;
  try {
    const unconfirmed=await login(req("/api/auth/login","POST",{email:"cognito@example.test",password:"Synthetic password 42!"}));assert.equal(unconfirmed.status,403);assert.equal((await unconfirmed.json()).code,"EMAIL_CONFIRMATION_REQUIRED");assert.equal(unconfirmed.headers.get("set-cookie"),null);
  } finally { verified=true; }
  const response=await login(req("/api/auth/login","POST",{email:"cognito@example.test",password:"Synthetic password 42!"}));assert.equal(response.status,200,await response.clone().text());const data=await response.json();assert.equal(data.account.provider,"cognito");assert.equal(JSON.stringify(data).includes("Token"),false);
  const cookie=cookies(response);assert.match(cookie,new RegExp(COGNITO_ACCESS_COOKIE));assert.ok(response.headers.getSetCookie().every(value=>/HttpOnly/.test(value)));const ages=response.headers.getSetCookie().map(value=>Number(value.match(/Max-Age=(\d+)/)?.[1]??0));assert.ok(ages.every(value=>value<=300));
  const checked=await (await session(req("/api/auth/session","GET",undefined,cookie))).json();assert.equal(checked.authenticated,true);assert.equal(checked.localProfilesEnabled,false);assert.equal(checked.account.id,data.account.id);
  const opaqueOnly=cookie.split("; ").filter(value=>!value.startsWith(COGNITO_ACCESS_COOKIE+"=")).join("; ");assert.equal((await(await session(req("/api/auth/session","GET",undefined,opaqueOnly))).json()).authenticated,false);
  await repo.auth.createExternalAccount({provider:"cognito",subject:"different-cognito-subject",email:"different@example.test",displayName:"Different account",emailVerified:true});
  const different=await tokens({id:{sub:"different-cognito-subject"},access:{sub:"different-cognito-subject"}});
  const crossAccount=opaqueOnly+`; ${COGNITO_ACCESS_COOKIE}=${different.accessToken}`;
  assert.equal((await(await session(req("/api/auth/session","GET",undefined,crossAccount))).json()).authenticated,false);
  assert.equal((await presence(req("/api/local/presence","POST",{},crossAccount))).status,401);
  assert.equal((await presence(req("/api/local/presence","POST",{},cookie,{"x-further-actor":"forged-learner"}))).status,409);
  assert.equal(calls.filter(value=>value==="jwks").length,1,"Repeated session checks must reuse cached JWKS");
  const signedOut=await logout(req("/api/auth/logout","POST",{},cookie));assert.equal(signedOut.status,200);assert.equal((await(await session(req("/api/auth/session","GET",undefined,cookie))).json()).authenticated,false);assert.match((await signedOut.json()).logoutUrl,/^https:\/\/further-test\.auth\./);assert.ok(signedOut.headers.getSetCookie().some(value=>value.startsWith(COGNITO_ACCESS_COOKIE+"=")&&value.includes("Max-Age=0")));
});

test("Facebook authorization uses PKCE and one-use browser state; forged and replayed callbacks never exchange tokens",async()=>{
  const before=calls.filter(value=>value==="token-exchange").length;
  const started=await start(req("/api/auth/cognito/start?provider=Facebook"));assert.equal(started.status,302);const target=new URL(started.headers.get("location")!);assert.equal(target.searchParams.get("identity_provider"),"Facebook");assert.equal(target.searchParams.get("code_challenge_method"),"S256");assert.equal(target.searchParams.get("response_type"),"code");assert.equal(target.searchParams.get("client_id"),config.clientId);nonce=target.searchParams.get("nonce")!;const state=target.searchParams.get("state")!;const cookie=cookies(started);
  const forged=await callback(req("/api/auth/cognito/callback?state=forged&code=code","GET",undefined,cookie));assert.equal(forged.status,303);assert.match(forged.headers.get("location")!,/cognito_state/);assert.equal(calls.filter(value=>value==="token-exchange").length,before);
  const goodPath=`/api/auth/cognito/callback?state=${state}&code=synthetic-code`;
  const good=await callback(req(goodPath,"GET",undefined,cookie,{"sec-fetch-site":"cross-site"}));assert.equal(good.status,303);assert.equal(good.headers.get("location"),"/");assert.ok(good.headers.getSetCookie().some(value=>value.startsWith(COGNITO_ACCESS_COOKIE+"=")));
  const replay=await callback(req(goodPath,"GET",undefined,cookie));assert.match(replay.headers.get("location")!,/cognito_expired/);assert.equal(calls.filter(value=>value==="token-exchange").length,before+1);
});

test("AWS mode fails closed for unconfigured Facebook and never accepts external redirect domains",async()=>{
  process.env.FURTHER_COGNITO_FACEBOOK_CONFIGURED="false";assert.equal((await start(req("/api/auth/cognito/start?provider=Facebook"))).status,503);process.env.FURTHER_COGNITO_FACEBOOK_CONFIGURED="true";
  process.env.FURTHER_COGNITO_DOMAIN="https://unrelated.example";assert.throws(()=>cognitoConfig(),/invalid hosted domain/);process.env.FURTHER_COGNITO_DOMAIN=config.domain;
  assert.equal((await start(req("/api/auth/cognito/start?provider=Other"))).status,400);
});
