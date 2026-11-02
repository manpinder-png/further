// Server domain. Import this only from server routes, agents or local tools.
// Contracts are separately importable without pulling the database into a browser.
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { replay } from "../../lib/math";
import type { Concept, Edge, FEvent, Profile } from "../../lib/types";
import type { AgentRunRecord, DataProfile, FurtherRepository, Invitation, Json, LearningSession, MediaRecord, MetadataRecord, PeerCandidate, Provenance, SessionMessage, Snapshot, VectorHit, VectorRecord } from "./contracts";

interface Sql { query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }
type ProfileRow = { id: string; display_name: string; static_profile: Profile["staticProfile"]; preferences: Profile["preferences"]; current_intent: string; open_to_match: boolean; language: string; available_minutes: number; revision: number };
type EventRow = { id: number | string; concept_slug: string; kind: FEvent["kind"]; payload: Json; occurred_at: number | string };
type ConceptRow = { slug: string; title: string; hook: string; summary?: string; domain: string; difficulty?: number; cover_url?: string };
type InvitationRow = { id: string; from_user: string; to_user: string; concept_slug: string; status: Invitation["status"]; accepted_by: string[]; session_id?: string; expires_at: number | string; created_at: number | string; reason: string; score: number; context: Json };
type MessageRow = { id: string; session_id: string; author_id: string | null; kind: SessionMessage["kind"]; body: string; created_at: number | string; provenance?: Provenance };
type SessionRow = { id: string; invitation_id: string; concept_slug: string; created_at: number | string; ended_at?: number | string; summary: string[]; context: Json };
type RunRow={id:string;learner_id:string;agent_id:string;parent_run_id?:string;status:AgentRunRecord["status"];input_json:Json;output_json?:Json;model?:string;provider?:string;error?:string;created_at:number;finished_at?:number};
const json = (value: unknown) => JSON.stringify(value);
const bad = (message: string): never => { throw new DataError(message); };
export class DataError extends Error { constructor(message: string, public code = "DATA_CONFLICT") { super(message); this.name = "DataError"; } }
const profile = (r: ProfileRow): DataProfile => ({ id: r.id, displayName: r.display_name, staticProfile: r.static_profile, preferences: r.preferences, currentIntent: r.current_intent, openToMatch: r.open_to_match, language: r.language, availableMinutes: r.available_minutes, revision: r.revision });
const event = (r: EventRow): FEvent => ({ id: Number(r.id), slug: r.concept_slug, kind: r.kind, payload: r.payload, at: Number(r.occurred_at) });
const concept = (r: ConceptRow): Concept => ({ slug: r.slug, title: r.title, hook: r.hook, summary: r.summary ?? undefined, domain: r.domain, difficulty: r.difficulty ?? undefined, coverUrl: r.cover_url ?? undefined });
const invitation = (r: InvitationRow): Invitation => ({ id: r.id, fromUserId: r.from_user, toUserId: r.to_user, conceptSlug: r.concept_slug, status: r.status, acceptedBy: r.accepted_by, sessionId: r.session_id ?? undefined, expiresAt: Number(r.expires_at), createdAt: Number(r.created_at), reason: r.reason, score: r.score, context: r.context });
const message = (r: MessageRow): SessionMessage => ({ id: r.id, sessionId: r.session_id, authorId: r.author_id, kind: r.kind, text: r.body, createdAt: Number(r.created_at), provenance: r.provenance ?? undefined });
const runRecord = (r:RunRow):AgentRunRecord => ({id:r.id,actorId:r.learner_id,agentId:r.agent_id,parentRunId:r.parent_run_id??undefined,status:r.status,input:r.input_json,output:r.output_json??undefined,model:r.model??undefined,provider:r.provider??undefined,error:r.error??undefined,createdAt:Number(r.created_at),finishedAt:r.finished_at?Number(r.finished_at):undefined});
const uuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
function actor(id: string) { if (!uuid(id)) bad("Invalid learner identity"); }

async function eventsFor(db: Sql, id: string) {
  return (await db.query<EventRow>("SELECT * FROM learning_events WHERE learner_id=$1 ORDER BY occurred_at,id", [id])).rows.map(event);
}
async function getProfile(db: Sql, id: string): Promise<DataProfile> {
  actor(id);
  const r = (await db.query<ProfileRow>("SELECT * FROM learners WHERE id=$1", [id])).rows[0];
  if (!r) throw new DataError("Learner not found", "NOT_FOUND");
  return profile(r);
}
async function blocked(db: Sql, a: string, b: string) {
  return (await db.query("SELECT 1 FROM blocks WHERE (blocker=$1 AND blocked=$2) OR (blocker=$2 AND blocked=$1)", [a,b])).rows.length > 0;
}
async function member(db: Sql, actorId: string, sessionId: string) {
  actor(actorId);
  if (!uuid(sessionId) || !(await db.query("SELECT 1 FROM session_members WHERE session_id=$1 AND learner_id=$2",[sessionId,actorId])).rows.length) throw new DataError("Session not found", "NOT_FOUND");
}
async function expire(db: Sql) { await db.query("UPDATE invitations SET status='expired' WHERE status='pending' AND expires_at <= $1", [Date.now()]); }
async function invitationFor(db: Sql, actorId: string, id: string, lock = false) {
  actor(actorId);
  if (!uuid(id)) bad("Invalid invitation");
  const r = (await db.query<InvitationRow>(`SELECT * FROM invitations WHERE id=$1 AND (from_user=$2 OR to_user=$2)${lock ? " FOR UPDATE" : ""}`, [id,actorId])).rows[0];
  if (!r) throw new DataError("Invitation not found", "NOT_FOUND");
  return r;
}
async function record(db: Sql, actorId: string, e: { slug: string; kind: FEvent["kind"]; payload?: Json; idempotencyKey: string; at?: number }) {
  actor(actorId);
  if (!e.idempotencyKey || e.idempotencyKey.length > 200) bad("A bounded idempotency key is required");
  const old = (await db.query<EventRow>("SELECT * FROM learning_events WHERE learner_id=$1 AND idempotency_key=$2",[actorId,e.idempotencyKey])).rows[0];
  if (old) {
    if (old.concept_slug !== e.slug || old.kind !== e.kind) bad("Idempotency key belongs to another event");
    return event(old);
  }
  const at = e.at ?? Date.now();
  if (!Number.isSafeInteger(at) || at < 0 || at > Date.now() + 60_000) bad("Invalid event timestamp");
  await db.query("INSERT INTO learner_concepts(learner_id,concept_slug,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[actorId,e.slug,at]);
  const inserted = await db.query<EventRow>("INSERT INTO learning_events(learner_id,concept_slug,kind,payload,idempotency_key,occurred_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[actorId,e.slug,e.kind,json(e.payload ?? {}),e.idempotencyKey,at]);
  return event(inserted.rows[0]);
}

export interface RepositoryOptions { dataDir?: string; migrationPath?: string }

/** An explicit directory is durable. Omit dataDir for an isolated in-memory test. */
export async function createRepository(options: RepositoryOptions = {}): Promise<FurtherRepository> {
  let lockPath: string | undefined;
  if (options.dataDir) {
    const path = resolve(options.dataDir);
    await mkdir(dirname(path), { recursive: true });
    lockPath = path + ".owner-lock";
    try {
      const lock = await open(lockPath,"wx",0o600);
      await lock.writeFile(String(process.pid)); await lock.close();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const pid = Number(await readFile(lockPath,"utf8"));
      let alive = Number.isInteger(pid) && pid > 0;
      if (alive) { try { process.kill(pid,0); } catch { alive = false; } }
      if (alive) throw new DataError("The local database is already open in another process. Stop that process before starting another server.", "DATABASE_LOCKED");
      await unlink(lockPath);
      const lock = await open(lockPath,"wx",0o600);
      await lock.writeFile(String(process.pid)); await lock.close();
    }
  }
  let db!: PGlite;
  try {
    db = await PGlite.create({ dataDir: options.dataDir, extensions: { vector } });
    const sql = await readFile(options.migrationPath ?? resolve(process.cwd(), "domains/data/migrations/001_local.sql"),"utf8");
    await db.exec(sql);
    await db.query("INSERT INTO schema_migrations(version,applied_at) VALUES(1,$1) ON CONFLICT DO NOTHING",[Date.now()]);
  } catch (err) {
    if (db) await db.close().catch(()=>undefined);
    if (lockPath) await unlink(lockPath).catch(() => undefined);
    throw err;
  }

  const repository: FurtherRepository = {
    async listLocalUsers() { return (await db.query<{id:string;display_name:string}>("SELECT id,display_name FROM learners ORDER BY created_at")).rows.map(r=>({id:r.id,displayName:r.display_name})); },
    async ensureUser(actorId, displayName = "Explorer") {
      actor(actorId);
      if (!displayName.trim() || displayName.length > 80) bad("Invalid display name");
      const now=Date.now();
      await db.query("INSERT INTO learners(id,display_name,created_at,updated_at) VALUES($1,$2,$3,$3) ON CONFLICT DO NOTHING",[actorId,displayName.trim(),now]);
      return getProfile(db,actorId);
    },
    getProfile: (id) => getProfile(db,id),
    async updateProfile(actorId, patch) {
      return db.transaction(async tx => {
        await tx.query("SELECT id FROM learners WHERE id=$1 FOR UPDATE",[actorId]);
        const old = await getProfile(tx,actorId);
        const p={...old,...patch,staticProfile:{...old.staticProfile,...patch.staticProfile},preferences:{...old.preferences,...patch.preferences}};
        if (!p.displayName.trim() || p.displayName.length > 80 || p.currentIntent.length > 4000 || !Number.isInteger(p.availableMinutes) || p.availableMinutes < 1 || p.availableMinutes > 240) bad("Invalid profile");
        if (p.openToMatch && !p.staticProfile.age18Plus) bad("Confirm you are 18 or older before becoming discoverable");
        await tx.query("UPDATE learners SET display_name=$2,static_profile=$3,preferences=$4,current_intent=$5,open_to_match=$6,language=$7,available_minutes=$8,revision=revision+1,updated_at=$9 WHERE id=$1",[actorId,p.displayName.trim(),json(p.staticProfile),json(p.preferences),p.currentIntent,p.openToMatch,p.language,p.availableMinutes,Date.now()]);
        await tx.query("INSERT INTO profile_revisions(id,learner_id,revision,patch,created_at) VALUES($1,$2,$3,$4,$5)",[randomUUID(),actorId,old.revision+1,json(patch),Date.now()]);
        if (!p.openToMatch) {
          await tx.query("DELETE FROM presence WHERE learner_id=$1",[actorId]);
          await tx.query("UPDATE invitations SET status='expired' WHERE status='pending' AND (from_user=$1 OR to_user=$1)",[actorId]);
        }
        return getProfile(tx,actorId);
      });
    },
    async getConcepts() { return (await db.query<ConceptRow>("SELECT * FROM concepts ORDER BY created_at,slug")).rows.map(concept); },
    async addConcepts(actorId, concepts, edges = []) {
      await getProfile(db,actorId);
      await db.transaction(async tx => {
        for (const c of concepts) {
          if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(c.slug) || !c.title.trim()) bad("Invalid concept");
          // An existing canonical concept is not overwritten by another learner's model response.
          await tx.query("INSERT INTO concepts(slug,title,hook,summary,domain,difficulty,cover_url,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",[c.slug,c.title,c.hook ?? "",c.summary ?? null,c.domain ?? "general",c.difficulty ?? null,c.coverUrl ?? null,Date.now()]);
          await record(tx,actorId,{slug:c.slug,kind:"seed",idempotencyKey:`seed:${c.slug}`});
        }
        for (const e of edges) {
          if (e.src === e.dst) continue;
          const exists = await tx.query("SELECT slug FROM concepts WHERE slug IN ($1,$2)",[e.src,e.dst]);
          if (exists.rows.length < 2) continue;
          await tx.query("INSERT INTO concept_edges(src,dst,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[e.src,e.dst,e.kind]);
        }
      });
    },
    async recordEvent(actorId, e) { return db.transaction(tx => record(tx,actorId,e)); },
    async saveMetadata(actorId, kind, values, provenance) {
      await getProfile(db,actorId);
      const r: MetadataRecord={id:randomUUID(),kind,values,provenance,createdAt:Date.now()};
      await db.query("INSERT INTO inferred_metadata(id,learner_id,kind,values_json,provenance,created_at) VALUES($1,$2,$3,$4,$5,$6)",[r.id,actorId,kind,json(values),json(provenance),r.createdAt]);
      return r;
    },
    async heartbeat(actorId, ttlMs=60_000) {
      const p=await getProfile(db,actorId);
      if (!p.openToMatch || !p.staticProfile.age18Plus) { await db.query("DELETE FROM presence WHERE learner_id=$1",[actorId]); return; }
      const now=Date.now();
      await db.query("INSERT INTO presence(learner_id,last_seen,expires_at) VALUES($1,$2,$3) ON CONFLICT(learner_id) DO UPDATE SET last_seen=$2,expires_at=$3",[actorId,now,now+Math.max(1000,Math.min(ttlMs,120_000))]);
    },
    async listCandidates(actorId) {
      const self=await getProfile(db,actorId);
      if (!self.openToMatch || !self.staticProfile.age18Plus) return [];
      const rows=(await db.query<ProfileRow & {last_seen:number}>("SELECT l.*,p.last_seen FROM learners l JOIN presence p ON p.learner_id=l.id WHERE l.id<>$1 AND l.open_to_match=true AND l.language=$2 AND p.expires_at>$3 AND NOT EXISTS(SELECT 1 FROM session_members sm JOIN learning_sessions s ON s.id=sm.session_id WHERE sm.learner_id IN($1,l.id) AND s.ended_at IS NULL) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker=$1 AND b.blocked=l.id) OR (b.blocker=l.id AND b.blocked=$1)) AND NOT EXISTS(SELECT 1 FROM invitations i WHERE i.status='declined' AND i.created_at>$4 AND ((i.from_user=$1 AND i.to_user=l.id) OR(i.to_user=$1 AND i.from_user=l.id)))",[actorId,self.language,Date.now(),Date.now()-86_400_000])).rows;
      const candidates:PeerCandidate[]=[];
      for (const row of rows) {
        if (!row.static_profile.age18Plus) continue;
        const nodes=Object.values(replay(await eventsFor(db,row.id)));
        const active=nodes.filter(n=>n.interest>=0.2).sort((a,b)=>b.interest-a.interest).slice(0,5);
        // Explicit projection: no background, preferences, raw intent, event payloads, media or inferred metadata.
        candidates.push({id:row.id,name:row.display_name,demo:false,activeConcepts:active.map(n=>n.slug),mastery:Object.fromEntries(active.map(n=>[n.slug,n.mastery])),openToMatch:true,language:row.language,lastActive:Number(row.last_seen),color:"#4ddfe6",availableMinutes:row.available_minutes});
      }
      return candidates;
    },
    async invite(actorId, peerId, slug, options={}) {
      actor(actorId); actor(peerId);
      if (actorId===peerId) bad("Cannot invite yourself");
      return db.transaction(async tx=>{
        await expire(tx);
        const a=await getProfile(tx,actorId),b=await getProfile(tx,peerId);
        if (!a.openToMatch || !b.openToMatch || !a.staticProfile.age18Plus || !b.staticProfile.age18Plus || a.language!==b.language || await blocked(tx,actorId,peerId)) bad("This connection is no longer available");
        const present=(await tx.query("SELECT learner_id FROM presence WHERE learner_id IN($1,$2) AND expires_at>$3",[actorId,peerId,Date.now()])).rows;
        if (present.length!==2) bad("Both learners must be available now");
        const pair=[actorId,peerId].sort().join(":");
        const declined=(await tx.query("SELECT id FROM invitations WHERE pair_key=$1 AND status='declined' AND created_at>$2",[pair,Date.now()-86_400_000])).rows;
        if (declined.length) bad("This invitation was recently declined");
        const active=(await tx.query("SELECT sm.session_id FROM session_members sm JOIN learning_sessions s ON s.id=sm.session_id WHERE sm.learner_id IN($1,$2) AND s.ended_at IS NULL",[actorId,peerId])).rows;
        if (active.length) bad("A learner is already in a session");
        const now=Date.now();
        await tx.query("INSERT INTO invitations(id,from_user,to_user,pair_key,concept_slug,reason,score,context,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING",[randomUUID(),actorId,peerId,pair,slug,options.reason??"A shared curiosity",options.score??0,json(options.context??{}),now,now+Math.max(1000,Math.min(options.ttlMs??60_000,300_000))]);
        const row=(await tx.query<InvitationRow>("SELECT * FROM invitations WHERE pair_key=$1 AND status='pending'",[pair])).rows[0];
        return invitation(row);
      });
    },
    async respondToInvite(actorId, invitationId, decision) {
      if (decision!=="accept" && decision!=="decline") bad("Invalid decision");
      return db.transaction(async tx=>{
        await expire(tx);
        const r=await invitationFor(tx,actorId,invitationId,true);
        if (r.status!=="pending") return invitation(r);
        if (decision==="decline") {
          const changed=(await tx.query<InvitationRow>("UPDATE invitations SET status='declined' WHERE id=$1 RETURNING *",[invitationId])).rows[0];
          return invitation(changed);
        }
        const a=await getProfile(tx,r.from_user),b=await getProfile(tx,r.to_user);
        if (!a.openToMatch || !b.openToMatch || !a.staticProfile.age18Plus || !b.staticProfile.age18Plus || a.language!==b.language || await blocked(tx,r.from_user,r.to_user)) bad("This connection is no longer available");
        const present=(await tx.query("SELECT learner_id FROM presence WHERE learner_id IN($1,$2) AND expires_at>$3",[r.from_user,r.to_user,Date.now()])).rows;
        if(present.length!==2) bad("Both learners must still be available");
        const accepted=Array.from(new Set([...r.accepted_by,actorId]));
        let sessionId:string|undefined;
        if (accepted.length===2) {
          const active=(await tx.query("SELECT sm.session_id FROM session_members sm JOIN learning_sessions s ON s.id=sm.session_id WHERE sm.learner_id IN($1,$2) AND s.ended_at IS NULL",[r.from_user,r.to_user])).rows;
          if (active.length) bad("A learner is already in a session");
          sessionId=randomUUID();
          await tx.query("INSERT INTO learning_sessions(id,invitation_id,concept_slug,context,created_at) VALUES($1,$2,$3,$4,$5)",[sessionId,r.id,r.concept_slug,json(r.context),Date.now()]);
          for (const id of [r.from_user,r.to_user]) await tx.query("INSERT INTO session_members(session_id,learner_id) VALUES($1,$2)",[sessionId,id]);
        }
        const next=(await tx.query<InvitationRow>("UPDATE invitations SET accepted_by=$2,status=$3,session_id=$4 WHERE id=$1 RETURNING *",[r.id,accepted,sessionId?"accepted":"pending",sessionId??null])).rows[0];
        return invitation(next);
      });
    },
    async getInvitations(actorId) {
      actor(actorId); await expire(db);
      return (await db.query<InvitationRow>("SELECT * FROM invitations WHERE from_user=$1 OR to_user=$1 ORDER BY created_at DESC LIMIT 50",[actorId])).rows.map(invitation);
    },
    async getInvitation(actorId,id) { await expire(db); return invitation(await invitationFor(db,actorId,id)); },
    async getSession(actorId,id) {
      await member(db,actorId,id);
      const r=(await db.query<SessionRow>("SELECT * FROM learning_sessions WHERE id=$1",[id])).rows[0];
      const participants=(await db.query<{learner_id:string}>("SELECT learner_id FROM session_members WHERE session_id=$1 ORDER BY learner_id",[id])).rows.map(x=>x.learner_id);
      const messages=(await db.query<MessageRow>("SELECT * FROM session_messages WHERE session_id=$1 ORDER BY created_at,id",[id])).rows.map(message);
      return {id:r.id,invitationId:r.invitation_id,conceptSlug:r.concept_slug,participants,createdAt:Number(r.created_at),endedAt:r.ended_at?Number(r.ended_at):undefined,summary:r.summary,context:r.context,messages};
    },
    async appendMessage(actorId, sessionId, text, options) {
      if (!text.trim() || text.length>12000 || !options.idempotencyKey || options.idempotencyKey.length>200) bad("Invalid message");
      return db.transaction(async tx=>{
        await member(tx,actorId,sessionId);
        const s=(await tx.query<SessionRow>("SELECT * FROM learning_sessions WHERE id=$1 FOR UPDATE",[sessionId])).rows[0];
        if (s.ended_at) bad("Session has ended");
        const peers=(await tx.query<{learner_id:string}>("SELECT learner_id FROM session_members WHERE session_id=$1 AND learner_id<>$2",[sessionId,actorId])).rows;
        for (const p of peers) if (await blocked(tx,actorId,p.learner_id)) bad("This connection is blocked");
        const kind=options.kind??"human";
        await tx.query("INSERT INTO session_messages(id,session_id,author_id,kind,body,provenance,idempotency_key,submitted_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING",[randomUUID(),sessionId,kind==="human"?actorId:null,kind,text.trim(),options.provenance?json(options.provenance):null,options.idempotencyKey,actorId,Date.now()]);
        const saved=(await tx.query<MessageRow & {payload_matches:boolean}>("SELECT *, body=$4 AND kind=$5 AND (provenance IS NOT DISTINCT FROM $6::jsonb) AS payload_matches FROM session_messages WHERE session_id=$1 AND submitted_by=$2 AND idempotency_key=$3",[sessionId,actorId,options.idempotencyKey,text.trim(),kind,options.provenance?json(options.provenance):null])).rows[0];
        if(!saved.payload_matches) bad("Idempotency key belongs to another message payload");
        return message(saved);
      });
    },
    async completeSession(actorId, sessionId, summary=[]) {
      await db.transaction(async tx=>{
        await member(tx,actorId,sessionId);
        const s=(await tx.query<SessionRow>("SELECT * FROM learning_sessions WHERE id=$1 FOR UPDATE",[sessionId])).rows[0];
        if (s.ended_at) return;
        const participants=(await tx.query<{learner_id:string}>("SELECT learner_id FROM session_members WHERE session_id=$1",[sessionId])).rows;
        const now=Date.now();
        const contributors=(await tx.query<{author_id:string}>("SELECT DISTINCT author_id FROM session_messages WHERE session_id=$1 AND kind='human' AND author_id IS NOT NULL",[sessionId])).rows.map(r=>r.author_id);
        const credited=participants.length>=2 && participants.every(p=>contributors.includes(p.learner_id));
        const context={...s.context,completion:{humanParticipants:contributors.length,credited,evidence:"participation-only; not proof of understanding"}};
        await tx.query("UPDATE learning_sessions SET ended_at=$2,summary=$3,context=$4 WHERE id=$1",[sessionId,now,json(summary.slice(0,10).map(x=>x.slice(0,1000))),json(context)]);
        // Exactly one event per learner, only after both participated. All
        // projections use the same TypeScript replay; this is a product heuristic.
        if(credited) for (const p of participants) await record(tx,p.learner_id,{slug:s.concept_slug,kind:"session",payload:{sessionId,with:participants.find(x=>x.learner_id!==p.learner_id)?.learner_id,evidence:"participation"},idempotencyKey:`session:${sessionId}`,at:now});
      });
      return repository.getSession(actorId,sessionId);
    },
    async isBlocked(actorId,peerId) {
      actor(actorId); actor(peerId);
      return blocked(db,actorId,peerId);
    },
    async block(actorId,peerId) {
      actor(actorId); actor(peerId);
      if (actorId===peerId) bad("Cannot block yourself");
      await db.transaction(async tx=>{
        const now=Date.now();
        await tx.query("INSERT INTO blocks(blocker,blocked,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[actorId,peerId,now]);
        await tx.query("UPDATE invitations SET status='declined' WHERE status='pending' AND ((from_user=$1 AND to_user=$2) OR(from_user=$2 AND to_user=$1))",[actorId,peerId]);
        // A block closes active shared rooms immediately, without recording a
        // learning event. A later completion retry observes ended_at and exits.
        await tx.query("UPDATE learning_sessions s SET ended_at=$3,summary=$4,context=context || $5::jsonb WHERE ended_at IS NULL AND EXISTS(SELECT 1 FROM session_members sm WHERE sm.session_id=s.id AND sm.learner_id=$1) AND EXISTS(SELECT 1 FROM session_members sm WHERE sm.session_id=s.id AND sm.learner_id=$2)",[actorId,peerId,now,json(["This session was closed after a participant blocked the connection."]),json({completion:{credited:false,reason:"blocked",evidence:"no learning credit recorded"}})]);
      });
    },
    async report(actorId,peerId,reason,sessionId) {
      actor(actorId); actor(peerId);
      if (!reason.trim() || reason.length>2000) bad("A short report reason is required");
      if (sessionId) {
        await member(db,actorId,sessionId);
        await member(db,peerId,sessionId);
      }
      const id=randomUUID();
      await db.query("INSERT INTO reports(id,reporter,reported,session_id,reason,created_at) VALUES($1,$2,$3,$4,$5,$6)",[id,actorId,peerId,sessionId??null,reason.trim(),Date.now()]);
      return id;
    },
    async beginAgentRun(input) {
      await getProfile(db,input.actorId);
      if (input.parentRunId) {
        const parent=(await db.query("SELECT id FROM agent_runs WHERE id=$1 AND learner_id=$2",[input.parentRunId,input.actorId])).rows;
        if (!parent.length) bad("Parent run not found");
      }
      const r:AgentRunRecord={...input,status:"running",createdAt:Date.now()};
      await db.query("INSERT INTO agent_runs(id,learner_id,agent_id,parent_run_id,status,input_json,model,provider,created_at) VALUES($1,$2,$3,$4,'running',$5,$6,$7,$8)",[r.id,r.actorId,r.agentId,r.parentRunId??null,json(r.input),r.model??null,r.provider??null,r.createdAt]);
      return r;
    },
    async finishAgentRun(actorId,runId,result) {
      const changed=await db.query("UPDATE agent_runs SET status=$3,output_json=$4,error=$5,model=COALESCE($6,model),provider=COALESCE($7,provider),finished_at=$8 WHERE id=$1 AND learner_id=$2 AND status='running' RETURNING id",[runId,actorId,result.error?"failed":"succeeded",result.output?json(result.output):null,result.error?.slice(0,2000)??null,result.model??null,result.provider??null,Date.now()]);
      if (!changed.rows.length) bad("Agent run not found or already finished");
    },
    async getAgentRun(actorId,runId) {
      actor(actorId);if(!uuid(runId)) bad("Invalid run id");
      const r=(await db.query<RunRow>("SELECT * FROM agent_runs WHERE learner_id=$1 AND id=$2",[actorId,runId])).rows[0];
      return r?runRecord(r):null;
    },
    async getAgentRuns(actorId,limit=50) {
      actor(actorId);
      return (await db.query<RunRow>("SELECT * FROM agent_runs WHERE learner_id=$1 ORDER BY created_at DESC LIMIT $2",[actorId,Math.max(1,Math.min(limit,100))])).rows.map(runRecord);
    },
    async saveMedia(input) {
      await getProfile(db,input.actorId);
      const r={...input,id:randomUUID(),createdAt:Date.now()};
      await db.query("INSERT INTO media_assets(id,learner_id,kind,mime_type,local_path,content_hash,byte_size,extracted_text,provenance,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[r.id,r.actorId,r.kind,r.mimeType,r.localPath,r.contentHash,r.byteSize,r.extractedText??null,r.provenance?json(r.provenance):null,r.createdAt]);
      return r;
    },
    async getMedia(actorId,id) {
      actor(actorId);
      type R={id:string;learner_id:string;kind:MediaRecord["kind"];mime_type:string;local_path:string;content_hash:string;byte_size:number;extracted_text?:string;provenance?:Provenance;created_at:number};
      const r=(await db.query<R>("SELECT * FROM media_assets WHERE id=$1 AND learner_id=$2",[id,actorId])).rows[0];
      if(!r) throw new DataError("Media not found","NOT_FOUND");
      return {id:r.id,actorId:r.learner_id,kind:r.kind,mimeType:r.mime_type,localPath:r.local_path,contentHash:r.content_hash,byteSize:Number(r.byte_size),extractedText:r.extracted_text??undefined,provenance:r.provenance??undefined,createdAt:Number(r.created_at)};
    },
    async putVector(r) {
      actor(r.actorId); validateVector(r.vector);
      if(r.dimensions!==768 || r.mode!=="local-meta" || !r.model || !r.modelRevision) bad("Vector provenance is required");
      await db.query("INSERT INTO retrieval_vectors(id,learner_id,entity_type,entity_id,text_content,embedding,model,model_revision,dimensions,content_hash,mode,created_at) VALUES($1,$2,$3,$4,$5,$6::vector,$7,$8,768,$9,'local-meta',$10) ON CONFLICT(learner_id,entity_type,entity_id,model,model_revision) DO UPDATE SET text_content=EXCLUDED.text_content,embedding=EXCLUDED.embedding,content_hash=EXCLUDED.content_hash,created_at=EXCLUDED.created_at",[r.id,r.actorId,r.entityType,r.entityId,r.text,json(r.vector),r.model,r.modelRevision,r.contentHash,r.createdAt??Date.now()]);
    },
    async searchVectors(actorId,vector,options) {
      actor(actorId); validateVector(vector);
      type R={entity_type:VectorRecord["entityType"];entity_id:string;text_content:string;similarity:number;model:string;model_revision:string};
      const rows=(await db.query<R>("SELECT entity_type,entity_id,text_content,1-(embedding <=> $2::vector) AS similarity,model,model_revision FROM retrieval_vectors WHERE learner_id=$1 AND model=$3 AND model_revision=$4 AND ($5::text IS NULL OR entity_type=$5) ORDER BY embedding <=> $2::vector LIMIT $6",[actorId,json(vector),options.model,options.modelRevision,options.entityType??null,Math.max(1,Math.min(options.limit??10,50))])).rows;
      return rows.map(r=>({entityType:r.entity_type,entityId:r.entity_id,text:r.text_content,similarity:Number(r.similarity),model:r.model,modelRevision:r.model_revision} satisfies VectorHit));
    },
    async getSnapshot(actorId) {
      const p=await getProfile(db,actorId);
      const cs=(await db.query<ConceptRow>("SELECT c.* FROM concepts c JOIN learner_concepts lc ON lc.concept_slug=c.slug WHERE lc.learner_id=$1 ORDER BY lc.created_at,c.slug",[actorId])).rows.map(concept);
      const edges=(await db.query<Edge>("SELECT e.* FROM concept_edges e JOIN learner_concepts a ON a.concept_slug=e.src JOIN learner_concepts b ON b.concept_slug=e.dst WHERE a.learner_id=$1 AND b.learner_id=$1",[actorId])).rows;
      const events=await eventsFor(db,actorId);
      const metadata=(await db.query<{id:string;kind:string;values_json:Json;provenance:Provenance;created_at:number}>("SELECT * FROM inferred_metadata WHERE learner_id=$1 ORDER BY created_at DESC LIMIT 100",[actorId])).rows.map(r=>({id:r.id,kind:r.kind,values:r.values_json,provenance:r.provenance,createdAt:Number(r.created_at)}));
      const sessionIds=(await db.query<{session_id:string}>("SELECT sm.session_id FROM session_members sm JOIN learning_sessions s ON s.id=sm.session_id WHERE learner_id=$1 ORDER BY s.created_at DESC LIMIT 20",[actorId])).rows;
      const sessions:LearningSession[]=[];
      for (const r of sessionIds) sessions.push(await repository.getSession(actorId,r.session_id));
      return {mode:"local",actorId,profile:p,concepts:cs,edges,events,nodes:replay(events),metadata,invitations:await repository.getInvitations(actorId),sessions} satisfies Snapshot;
    },
    async close() { await db.close(); if(lockPath) await unlink(lockPath).catch(()=>undefined); },
  };
  return repository;
}

function validateVector(v:number[]) {
  if(v.length!==768 || v.some(x=>!Number.isFinite(x)) || !v.some(x=>x!==0)) bad("Expected a finite, nonzero 768-dimensional vector");
}

const shared = globalThis as typeof globalThis & { __furtherLocalRepository?: Promise<FurtherRepository> };
export function getRepository(): Promise<FurtherRepository> {
  shared.__furtherLocalRepository ??= createRepository({dataDir:process.env.FURTHER_DATA_DIR ?? resolve(process.cwd(),".local/data/pglite")}).catch(err=>{delete shared.__furtherLocalRepository;throw err;});
  return shared.__furtherLocalRepository;
}
