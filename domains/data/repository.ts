// Server domain. Import this only from server routes, agents or local tools.
// Contracts are separately importable without pulling the database into a browser.
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { replay } from "../../lib/math";
import type { Concept, Edge, FEvent, Profile } from "../../lib/types";
import type { AgentRunRecord, DataProfile, FurtherRepository, IndexItem, IndexJob, IndexSpace, IndexStatus, Invitation, Json, LearningSession, MediaRecord, MetadataRecord, PeerCandidate, Provenance, SessionMessage, Snapshot, VectorHit, VectorRecord } from "./contracts";
import { createAuthRepository } from "./auth-store";
import { EMBEDDING_SPACE } from "../retrieval/space";
import { metadataIndexText } from "../retrieval/projection";
import { pgliteDatabase, sqlJson, sqlUuid, type SqlDatabase, type SqlQuery } from "./sql";

type Sql = SqlQuery;
type ProfileRow = { id: string; display_name: string; static_profile: Profile["staticProfile"]; preferences: Profile["preferences"]; current_intent: string; open_to_match: boolean; language: string; available_minutes: number; revision: number };
type EventRow = { id: number | string; concept_slug: string; kind: FEvent["kind"]; payload: Json; occurred_at: number | string };
type ConceptRow = { slug: string; title: string; hook: string; summary?: string; domain: string; difficulty?: number; cover_url?: string };
type InvitationRow = { id: string; from_user: string; to_user: string; concept_slug: string; status: Invitation["status"]; accepted_by: string[]; session_id?: string; expires_at: number | string; created_at: number | string; reason: string; score: number; context: Json };
type MessageRow = { id: string; session_id: string; author_id: string | null; kind: SessionMessage["kind"]; body: string; created_at: number | string; provenance?: Provenance };
type SessionRow = { id: string; invitation_id: string; concept_slug: string; created_at: number | string; ended_at?: number | string; summary: string[]; context: Json };
type RunRow={id:string;learner_id:string;agent_id:string;parent_run_id?:string;status:AgentRunRecord["status"];input_json:Json;output_json?:Json;model?:string;provider?:string;error?:string;created_at:number;finished_at?:number};
const json = sqlJson;
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
const contentHash = (text: string) => createHash("sha256").update(text).digest("hex");
type JobRow = { id: string; learner_id: string; entity_type: IndexItem["entityType"]; entity_id: string; text_content: string; content_hash: string; model: string; model_revision: string; generation: number; status: IndexJob["status"]; attempts: number; not_before: number; lease_token?: string; lease_expires_at?: number; last_error?: string; updated_at: number };
const indexJob = (r: JobRow): IndexJob => ({ id: r.id, actorId: r.learner_id, entityType: r.entity_type, entityId: r.entity_id, text: r.text_content, contentHash: r.content_hash, model: r.model, modelRevision: r.model_revision, generation: Number(r.generation), status: r.status, attempts: Number(r.attempts), notBefore: Number(r.not_before), leaseToken: r.lease_token ?? undefined, leaseExpiresAt: r.lease_expires_at ? Number(r.lease_expires_at) : undefined, lastError: r.last_error ?? undefined, updatedAt: Number(r.updated_at) });
function checkSpace(space: IndexSpace) { if (!space.model || !space.modelRevision || space.model.length > 200 || space.modelRevision.length > 200) bad("A bounded embedding space is required"); }
async function indexStatus(db: Sql, actorId: string, space: IndexSpace): Promise<IndexStatus> {
  actor(actorId); checkSpace(space);
  const rows = (await db.query<{ status: IndexJob["status"]; count: number; next_attempt: number | null }>("SELECT status,COUNT(*) AS count,MIN(CASE WHEN status='processing' THEN lease_expires_at ELSE not_before END) AS next_attempt FROM retrieval_index_jobs WHERE learner_id=$1 AND model=$2 AND model_revision=$3 GROUP BY status", [sqlUuid(actorId), space.model, space.modelRevision])).rows;
  const result: IndexStatus = { ...space, pending: 0, processing: 0, retry: 0, ready: 0, total: 0 };
  for (const r of rows) { result[r.status] = Number(r.count); result.total += Number(r.count); if (r.status !== "ready" && r.next_attempt !== null) result.nextAttemptAt = Math.min(result.nextAttemptAt ?? Infinity, Number(r.next_attempt)); }
  return result;
}
async function enqueue(db: Sql, actorId: string, items: IndexItem[], space: IndexSpace) {
  actor(actorId); checkSpace(space);
  for (const item of items) {
    if (!item.text.trim() || item.text.length > 8000 || !item.entityId || item.entityId.length > 200) bad("Supply bounded, nonempty indexing content");
    if (item.entityType === "concept") {
      const owned = (await db.query<{ title: string; hook: string }>("SELECT c.title,c.hook FROM concepts c JOIN learner_concepts lc ON lc.concept_slug=c.slug WHERE lc.learner_id=$1 AND c.slug=$2", [sqlUuid(actorId), item.entityId])).rows[0];
      if (!owned || `${owned.title}. ${owned.hook}` !== item.text) bad("Index concepts from the learner's current saved map");
    } else if (item.entityType === "intent") {
      if (item.entityId !== "current" || (await getProfile(db, actorId)).currentIntent !== item.text) bad("Index the learner's current saved intent");
    } else if (item.entityType === "metadata") {
      const current = (await db.query<{id:string;values_json:Json}>("SELECT id,values_json FROM inferred_metadata WHERE learner_id=$1 AND kind='intent-proposal' ORDER BY created_at DESC,id DESC LIMIT 1", [sqlUuid(actorId)])).rows[0];
      if (!current || current.id !== item.entityId || metadataIndexText(current.values_json) !== item.text) bad("Index only the current private learning interpretation");
    } else {
      // New resource/metadata ingestion needs its own explicit ownership adapter.
      bad("This source type is not enabled for indexing");
    }
    const hash = contentHash(item.text), now = Date.now();
    const existingVector = (await db.query("SELECT 1 FROM retrieval_vectors WHERE learner_id=$1 AND entity_type=$2 AND entity_id=$3 AND model=$4 AND model_revision=$5 AND content_hash=$6", [sqlUuid(actorId), item.entityType, item.entityId, space.model, space.modelRevision, hash])).rows.length > 0;
    await db.query(`INSERT INTO retrieval_index_jobs(id,learner_id,entity_type,entity_id,text_content,content_hash,model,model_revision,status,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
      ON CONFLICT(learner_id,entity_type,entity_id,model,model_revision) DO UPDATE SET
      text_content=EXCLUDED.text_content,content_hash=EXCLUDED.content_hash,generation=retrieval_index_jobs.generation+1,
      status=EXCLUDED.status,attempts=0,not_before=0,lease_token=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=EXCLUDED.updated_at
      WHERE retrieval_index_jobs.content_hash<>EXCLUDED.content_hash`, [sqlUuid(randomUUID()), sqlUuid(actorId), item.entityType, item.entityId, item.text, hash, space.model, space.modelRevision, existingVector ? "ready" : "pending", now]);
  }
}
async function putVector(db: Sql, r: VectorRecord) {
  actor(r.actorId); validateVector(r.vector);
  if (r.dimensions !== 768 || r.mode !== "local-meta" || !r.model || !r.modelRevision) bad("Vector provenance is required");
  await db.query("INSERT INTO retrieval_vectors(id,learner_id,entity_type,entity_id,text_content,embedding,model,model_revision,dimensions,content_hash,mode,created_at) VALUES($1,$2,$3,$4,$5,$6::vector,$7,$8,768,$9,'local-meta',$10) ON CONFLICT(learner_id,entity_type,entity_id,model,model_revision) DO UPDATE SET text_content=EXCLUDED.text_content,embedding=EXCLUDED.embedding,content_hash=EXCLUDED.content_hash,created_at=EXCLUDED.created_at", [sqlUuid(r.id),sqlUuid(r.actorId),r.entityType,r.entityId,r.text,json(r.vector),r.model,r.modelRevision,r.contentHash,r.createdAt??Date.now()]);
}
async function reconcileMetadata(db: Sql, actorId: string, space: IndexSpace) {
  const latest = (await db.query<{id:string;values_json:Json}>("SELECT id,values_json FROM inferred_metadata WHERE learner_id=$1 AND kind='intent-proposal' ORDER BY created_at DESC,id DESC LIMIT 1", [sqlUuid(actorId)])).rows[0];
  const text = latest ? metadataIndexText(latest.values_json) : null;
  // Superseded proposals remain authoritative history, but only the current
  // interpretation needs a private vector. This bounds repetitive expansions.
  await db.query("DELETE FROM retrieval_index_jobs WHERE learner_id=$1 AND entity_type='metadata' AND ($2::text IS NULL OR entity_id<>$2)", [sqlUuid(actorId),text ? latest.id : null]);
  await db.query("DELETE FROM retrieval_vectors WHERE learner_id=$1 AND entity_type='metadata' AND ($2::text IS NULL OR entity_id<>$2)", [sqlUuid(actorId),text ? latest.id : null]);
  if (text) await enqueue(db,actorId,[{entityType:"metadata",entityId:latest.id,text}],space);
}

async function eventsFor(db: Sql, id: string) {
  return (await db.query<EventRow>("SELECT * FROM learning_events WHERE learner_id=$1 ORDER BY occurred_at,id", [sqlUuid(id)])).rows.map(event);
}
async function getProfile(db: Sql, id: string): Promise<DataProfile> {
  actor(id);
  const r = (await db.query<ProfileRow>("SELECT * FROM learners WHERE id=$1", [sqlUuid(id)])).rows[0];
  if (!r) throw new DataError("Learner not found", "NOT_FOUND");
  return profile(r);
}
async function blocked(db: Sql, a: string, b: string) {
  return (await db.query("SELECT 1 FROM blocks WHERE (blocker=$1 AND blocked=$2) OR (blocker=$2 AND blocked=$1)", [sqlUuid(a),sqlUuid(b)])).rows.length > 0;
}
async function member(db: Sql, actorId: string, sessionId: string) {
  actor(actorId);
  if (!uuid(sessionId) || !(await db.query("SELECT 1 FROM session_members WHERE session_id=$1 AND learner_id=$2",[sqlUuid(sessionId),sqlUuid(actorId)])).rows.length) throw new DataError("Session not found", "NOT_FOUND");
}
async function expire(db: Sql) { await db.query("UPDATE invitations SET status='expired' WHERE status='pending' AND expires_at <= $1", [Date.now()]); }
async function invitationFor(db: Sql, actorId: string, id: string, lock = false) {
  actor(actorId);
  if (!uuid(id)) bad("Invalid invitation");
  const r = (await db.query<InvitationRow>(`SELECT * FROM invitations WHERE id=$1 AND (from_user=$2 OR to_user=$2)${lock ? " FOR UPDATE" : ""}`, [sqlUuid(id),sqlUuid(actorId)])).rows[0];
  if (!r) throw new DataError("Invitation not found", "NOT_FOUND");
  return r;
}
async function record(db: Sql, actorId: string, e: { slug: string; kind: FEvent["kind"]; payload?: Json; idempotencyKey: string; at?: number }) {
  actor(actorId);
  if (!e.idempotencyKey || e.idempotencyKey.length > 200) bad("A bounded idempotency key is required");
  const old = (await db.query<EventRow>("SELECT * FROM learning_events WHERE learner_id=$1 AND idempotency_key=$2",[sqlUuid(actorId),e.idempotencyKey])).rows[0];
  if (old) {
    if (old.concept_slug !== e.slug || old.kind !== e.kind) bad("Idempotency key belongs to another event");
    return event(old);
  }
  const at = e.at ?? Date.now();
  if (!Number.isSafeInteger(at) || at < 0 || at > Date.now() + 60_000) bad("Invalid event timestamp");
  await db.query("INSERT INTO learner_concepts(learner_id,concept_slug,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[sqlUuid(actorId),e.slug,at]);
  const inserted = await db.query<EventRow>("INSERT INTO learning_events(learner_id,concept_slug,kind,payload,idempotency_key,occurred_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(learner_id,idempotency_key) DO NOTHING RETURNING *",[sqlUuid(actorId),e.slug,e.kind,json(e.payload ?? {}),e.idempotencyKey,at]);
  const saved=inserted.rows[0]??(await db.query<EventRow>("SELECT * FROM learning_events WHERE learner_id=$1 AND idempotency_key=$2",[sqlUuid(actorId),e.idempotencyKey])).rows[0];
  if(!saved||saved.concept_slug!==e.slug||saved.kind!==e.kind)bad("Idempotency key belongs to another event");
  return event(saved);
}

export interface RepositoryOptions { dataDir?: string; migrationPath?: string; database?: SqlDatabase }

/** An explicit directory is durable. Omit dataDir for an isolated in-memory test. */
export async function createRepository(options: RepositoryOptions = {}): Promise<FurtherRepository> {
  let lockPath: string | undefined;
  if (options.dataDir && !options.database) {
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
  let db!: SqlDatabase;
  try {
    db = options.database ?? pgliteDatabase(await PGlite.create({ dataDir: options.dataDir, extensions: { vector } }));
    const migrations = resolve(process.cwd(), "domains/data/migrations");
    const migrationLock = async (tx: SqlQuery) => { if (options.database) await tx.query("SELECT pg_advisory_xact_lock($1)",[41501010]); };
    await db.transaction(async tx => {
      await migrationLock(tx);
      await tx.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at bigint NOT NULL)");
    });
    const files = options.migrationPath ? [options.migrationPath] : (await readdir(migrations)).filter(name => /^\d+_.*\.sql$/.test(name)).sort().map(name => resolve(migrations, name));
    for (const file of files) {
      const version = Number(file.split("/").pop()!.match(/^\d+/)?.[0] ?? 1);
      const sql = await readFile(file, "utf8");
      await db.transaction(async tx => {
        await migrationLock(tx);
        if ((await tx.query("SELECT 1 FROM schema_migrations WHERE version=$1", [version])).rows.length) return;
        await tx.exec(sql); await tx.query("INSERT INTO schema_migrations(version,applied_at) VALUES($1,$2)", [version, Date.now()]);
      });
    }
  } catch (err) {
    if (db) await db.close().catch(()=>undefined);
    if (lockPath) await unlink(lockPath).catch(() => undefined);
    throw err;
  }

  const repository: FurtherRepository = {
    auth: createAuthRepository(db),
    async listLocalUsers() { return (await db.query<{id:string;display_name:string}>("SELECT l.id,l.display_name FROM learners l WHERE NOT EXISTS(SELECT 1 FROM accounts a WHERE a.learner_id=l.id) ORDER BY l.created_at")).rows.map(r=>({id:r.id,displayName:r.display_name})); },
    async ensureUser(actorId, displayName = "Explorer") {
      actor(actorId);
      if (!displayName.trim() || displayName.length > 80) bad("Invalid display name");
      const now=Date.now();
      await db.query("INSERT INTO learners(id,display_name,created_at,updated_at) VALUES($1,$2,$3,$3) ON CONFLICT DO NOTHING",[sqlUuid(actorId),displayName.trim(),now]);
      return getProfile(db,actorId);
    },
    getProfile: (id) => getProfile(db,id),
    async updateProfile(actorId, patch) {
      return db.transaction(async tx => {
        await tx.query("SELECT id FROM learners WHERE id=$1 FOR UPDATE",[sqlUuid(actorId)]);
        const old = await getProfile(tx,actorId);
        const p={...old,...patch,staticProfile:{...old.staticProfile,...patch.staticProfile},preferences:{...old.preferences,...patch.preferences}};
        if (!p.displayName.trim() || p.displayName.length > 80 || p.currentIntent.length > 4000 || !Number.isInteger(p.availableMinutes) || p.availableMinutes < 1 || p.availableMinutes > 240) bad("Invalid profile");
        if (p.openToMatch && !p.staticProfile.age18Plus) bad("Confirm you are 18 or older before becoming discoverable");
        await tx.query("UPDATE learners SET display_name=$2,static_profile=$3,preferences=$4,current_intent=$5,open_to_match=$6,language=$7,available_minutes=$8,revision=revision+1,updated_at=$9 WHERE id=$1",[sqlUuid(actorId),p.displayName.trim(),json(p.staticProfile),json(p.preferences),p.currentIntent,p.openToMatch,p.language,p.availableMinutes,Date.now()]);
        await tx.query("INSERT INTO profile_revisions(id,learner_id,revision,patch,created_at) VALUES($1,$2,$3,$4,$5)",[sqlUuid(randomUUID()),sqlUuid(actorId),old.revision+1,json(patch),Date.now()]);
        if (patch.currentIntent !== undefined && patch.currentIntent !== old.currentIntent) {
          if (p.currentIntent.trim()) await enqueue(tx, actorId, [{ entityType: "intent", entityId: "current", text: p.currentIntent }], EMBEDDING_SPACE);
          else { await tx.query("DELETE FROM retrieval_index_jobs WHERE learner_id=$1 AND entity_type='intent' AND entity_id='current'", [sqlUuid(actorId)]); await tx.query("DELETE FROM retrieval_vectors WHERE learner_id=$1 AND entity_type='intent' AND entity_id='current'", [sqlUuid(actorId)]); }
        }
        if (!p.openToMatch) {
          await tx.query("DELETE FROM presence WHERE learner_id=$1",[sqlUuid(actorId)]);
          await tx.query("UPDATE invitations SET status='expired' WHERE status='pending' AND (from_user=$1 OR to_user=$1)",[sqlUuid(actorId)]);
        }
        return getProfile(tx,actorId);
      });
    },
    async getConcepts() { return (await db.query<ConceptRow>("SELECT * FROM concepts ORDER BY created_at,slug")).rows.map(concept); },
    async addConcepts(actorId, concepts, edges = []) {
      await getProfile(db,actorId);
      await db.transaction(async tx => {
        // Shared canonical hierarchy needs one check-and-write order across
        // separate AWS clients. Local PGlite already serializes transactions.
        if(options.database&&edges.some(edge=>edge.kind==="part_of"))await tx.query("SELECT pg_advisory_xact_lock($1)",[41501011]);
        for (const c of concepts) {
          if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(c.slug) || !c.title.trim()) bad("Invalid concept");
          // An existing canonical concept is not overwritten by another learner's model response.
          await tx.query("INSERT INTO concepts(slug,title,hook,summary,domain,difficulty,cover_url,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",[c.slug,c.title,c.hook ?? "",c.summary ?? null,c.domain ?? "general",c.difficulty ?? null,c.coverUrl ?? null,Date.now()]);
          await record(tx,actorId,{slug:c.slug,kind:"seed",idempotencyKey:`seed:${c.slug}`});
          const canonical = (await tx.query<{title: string; hook: string}>("SELECT title,hook FROM concepts WHERE slug=$1", [c.slug])).rows[0];
          await enqueue(tx, actorId, [{ entityType: "concept", entityId: c.slug, text: `${canonical.title}. ${canonical.hook}` }], EMBEDDING_SPACE);
        }
        for (const e of edges) {
          if (e.src === e.dst) continue;
          const exists = await tx.query("SELECT concept_slug FROM learner_concepts WHERE learner_id=$1 AND concept_slug IN ($2,$3)",[sqlUuid(actorId),e.src,e.dst]);
          if (exists.rows.length < 2) continue;
          if (e.kind === "part_of") {
            const cycle = await tx.query(`WITH RECURSIVE descendants(slug) AS (
              SELECT $1::text UNION SELECT e.dst FROM concept_edges e JOIN descendants d ON e.src=d.slug WHERE e.kind='part_of'
            ) SELECT 1 FROM descendants WHERE slug=$2 LIMIT 1`, [e.dst,e.src]);
            if (cycle.rows.length) bad("A topic cannot be placed inside one of its own subtopics");
          }
          await tx.query("INSERT INTO concept_edges(src,dst,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[e.src,e.dst,e.kind]);
        }
      });
    },
    async recordEvent(actorId, e) { return db.transaction(tx => record(tx,actorId,e)); },
    async saveMetadata(actorId, kind, values, provenance) {
      await getProfile(db,actorId);
      return db.transaction(async tx=>{
        const latest = (await tx.query<{created_at:number}>("SELECT created_at FROM inferred_metadata WHERE learner_id=$1 AND kind=$2 ORDER BY created_at DESC LIMIT 1", [sqlUuid(actorId),kind])).rows[0];
        const r: MetadataRecord={id:randomUUID(),kind,values,provenance,createdAt:Math.max(Date.now(),Number(latest?.created_at??0)+1)};
        await tx.query("INSERT INTO inferred_metadata(id,learner_id,kind,values_json,provenance,created_at) VALUES($1,$2,$3,$4,$5,$6)",[sqlUuid(r.id),sqlUuid(actorId),kind,json(values),json(provenance),r.createdAt]);
        if (kind === "intent-proposal") await reconcileMetadata(tx,actorId,EMBEDDING_SPACE);
        return r;
      });
    },
    async heartbeat(actorId, ttlMs=60_000) {
      const p=await getProfile(db,actorId);
      if (!p.openToMatch || !p.staticProfile.age18Plus) { await db.query("DELETE FROM presence WHERE learner_id=$1",[sqlUuid(actorId)]); return; }
      const now=Date.now();
      await db.query("INSERT INTO presence(learner_id,last_seen,expires_at) VALUES($1,$2,$3) ON CONFLICT(learner_id) DO UPDATE SET last_seen=$2,expires_at=$3",[sqlUuid(actorId),now,now+Math.max(1000,Math.min(ttlMs,120_000))]);
    },
    async listCandidates(actorId) {
      const self=await getProfile(db,actorId);
      if (!self.openToMatch || !self.staticProfile.age18Plus || self.availableMinutes<10) return [];
      const now=Date.now();
      const rows=(await db.query<ProfileRow & {last_seen:number;reserved_concept:string|null}>(`
        SELECT l.*,p.last_seen,CASE WHEN reservation.to_user=l.id THEN COALESCE(reservation.context->>'peerConceptSlug',reservation.concept_slug) ELSE reservation.concept_slug END AS reserved_concept
        FROM learners l JOIN presence p ON p.learner_id=l.id
        LEFT JOIN invitations reservation ON reservation.status='pending' AND reservation.expires_at>$3
          AND ((reservation.from_user=$1 AND reservation.to_user=l.id) OR (reservation.to_user=$1 AND reservation.from_user=l.id))
        WHERE l.id<>$1 AND l.open_to_match=true AND l.language=$2 AND l.available_minutes>=10 AND p.expires_at>$3
          AND NOT EXISTS(SELECT 1 FROM session_members sm JOIN learning_sessions s ON s.id=sm.session_id WHERE sm.learner_id IN($1,l.id) AND s.ended_at IS NULL)
          AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker=$1 AND b.blocked=l.id) OR (b.blocker=l.id AND b.blocked=$1))
          AND NOT EXISTS(SELECT 1 FROM invitations i WHERE i.status='declined' AND i.created_at>$4 AND ((i.from_user=$1 AND i.to_user=l.id) OR(i.to_user=$1 AND i.from_user=l.id)))
          AND NOT EXISTS(SELECT 1 FROM invitations i WHERE i.status='pending' AND i.expires_at>$3
            AND (i.from_user IN($1,l.id) OR i.to_user IN($1,l.id))
            AND NOT ((i.from_user=$1 AND i.to_user=l.id) OR (i.to_user=$1 AND i.from_user=l.id)))
      `,[sqlUuid(actorId),self.language,now,now-86_400_000])).rows;
      const candidates:PeerCandidate[]=[];
      for (const row of rows) {
        if (!row.static_profile.age18Plus) continue;
        const nodes=Object.values(replay(await eventsFor(db,row.id)));
        const active=nodes.filter(n=>row.reserved_concept ? n.slug===row.reserved_concept : n.interest>=0.2).sort((a,b)=>b.interest-a.interest).slice(0,5);
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
        // Lock both participants in stable order so concurrent invitations cannot
        // reserve the same learner for incompatible pending conversations.
        await tx.query("SELECT id FROM learners WHERE id IN($1,$2) ORDER BY id FOR UPDATE",[sqlUuid(actorId),sqlUuid(peerId)]);
        const a=await getProfile(tx,actorId),b=await getProfile(tx,peerId);
        if (!a.openToMatch || !b.openToMatch || !a.staticProfile.age18Plus || !b.staticProfile.age18Plus || a.language!==b.language || await blocked(tx,actorId,peerId)) bad("This connection is no longer available");
        if (Math.min(a.availableMinutes,b.availableMinutes)<10) bad("Both learners need at least 10 minutes available");
        const peerConceptSlug = typeof options.context?.peerConceptSlug === "string" ? options.context.peerConceptSlug : slug;
        const ownTopic = await tx.query("SELECT 1 FROM learner_concepts WHERE learner_id=$1 AND concept_slug=$2", [sqlUuid(actorId),slug]);
        const peerTopic = await tx.query("SELECT 1 FROM learner_concepts WHERE learner_id=$1 AND concept_slug=$2", [sqlUuid(peerId),peerConceptSlug]);
        if (!ownTopic.rows.length || !peerTopic.rows.length) bad("The selected learning topics are no longer available");
        const present=(await tx.query("SELECT learner_id FROM presence WHERE learner_id IN($1,$2) AND expires_at>$3",[sqlUuid(actorId),sqlUuid(peerId),Date.now()])).rows;
        if (present.length!==2) bad("Both learners must be available now");
        const pair=[actorId,peerId].sort().join(":");
        const pending=(await tx.query<{pair_key:string;concept_slug:string;from_user:string;context:Json}>("SELECT pair_key,concept_slug,from_user,context FROM invitations WHERE status='pending' AND (from_user IN($1,$2) OR to_user IN($1,$2))",[sqlUuid(actorId),sqlUuid(peerId)])).rows;
        if (pending.some(inv => {
          const fromTopic=inv.from_user===actorId?slug:peerConceptSlug;
          const toTopic=inv.from_user===actorId?peerConceptSlug:slug;
          return inv.pair_key!==pair || inv.concept_slug!==fromTopic || (typeof inv.context.peerConceptSlug==="string"?inv.context.peerConceptSlug:inv.concept_slug)!==toTopic;
        })) bad("A learner already has another pending invitation");
        const declined=(await tx.query("SELECT id FROM invitations WHERE pair_key=$1 AND status='declined' AND created_at>$2",[pair,Date.now()-86_400_000])).rows;
        if (declined.length) bad("This invitation was recently declined");
        const active=(await tx.query("SELECT sm.session_id FROM session_members sm JOIN learning_sessions s ON s.id=sm.session_id WHERE sm.learner_id IN($1,$2) AND s.ended_at IS NULL",[sqlUuid(actorId),sqlUuid(peerId)])).rows;
        if (active.length) bad("A learner is already in a session");
        const now=Date.now();
        await tx.query("INSERT INTO invitations(id,from_user,to_user,pair_key,concept_slug,reason,score,context,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING",[sqlUuid(randomUUID()),sqlUuid(actorId),sqlUuid(peerId),pair,slug,options.reason??"A shared curiosity",options.score??0,json(options.context??{}),now,now+Math.max(1000,Math.min(options.ttlMs??60_000,300_000))]);
        const row=(await tx.query<InvitationRow>("SELECT * FROM invitations WHERE pair_key=$1 AND status='pending'",[pair])).rows[0];
        return invitation(row);
      });
    },
    async respondToInvite(actorId, invitationId, decision) {
      if (decision!=="accept" && decision!=="decline") bad("Invalid decision");
      return db.transaction(async tx=>{
        await expire(tx);
        const participants=await invitationFor(tx,actorId,invitationId);
        // Same participant-before-invitation lock order as invitation creation and
        // profile updates; availability must still fit when either learner accepts.
        await tx.query("SELECT id FROM learners WHERE id IN($1,$2) ORDER BY id FOR UPDATE",[sqlUuid(participants.from_user),sqlUuid(participants.to_user)]);
        const r=await invitationFor(tx,actorId,invitationId,true);
        if (r.status!=="pending") return invitation(r);
        if (decision==="decline") {
          const changed=(await tx.query<InvitationRow>("UPDATE invitations SET status='declined' WHERE id=$1 RETURNING *",[sqlUuid(invitationId)])).rows[0];
          return invitation(changed);
        }
        const a=await getProfile(tx,r.from_user),b=await getProfile(tx,r.to_user);
        if (!a.openToMatch || !b.openToMatch || !a.staticProfile.age18Plus || !b.staticProfile.age18Plus || a.language!==b.language || await blocked(tx,r.from_user,r.to_user)) bad("This connection is no longer available");
        if (Math.min(a.availableMinutes,b.availableMinutes)<10) bad("Both learners need at least 10 minutes available");
        const present=(await tx.query("SELECT learner_id FROM presence WHERE learner_id IN($1,$2) AND expires_at>$3",[sqlUuid(r.from_user),sqlUuid(r.to_user),Date.now()])).rows;
        if(present.length!==2) bad("Both learners must still be available");
        const accepted=Array.from(new Set([...r.accepted_by,actorId]));
        let sessionId:string|undefined;
        if (accepted.length===2) {
          const active=(await tx.query("SELECT sm.session_id FROM session_members sm JOIN learning_sessions s ON s.id=sm.session_id WHERE sm.learner_id IN($1,$2) AND s.ended_at IS NULL",[sqlUuid(r.from_user),sqlUuid(r.to_user)])).rows;
          if (active.length) bad("A learner is already in a session");
          sessionId=randomUUID();
          await tx.query("INSERT INTO learning_sessions(id,invitation_id,concept_slug,context,created_at) VALUES($1,$2,$3,$4,$5)",[sqlUuid(sessionId),sqlUuid(r.id),r.concept_slug,json(r.context),Date.now()]);
          for (const id of [r.from_user,r.to_user]) await tx.query("INSERT INTO session_members(session_id,learner_id) VALUES($1,$2)",[sqlUuid(sessionId),sqlUuid(id)]);
        }
        const next=(await tx.query<InvitationRow>("UPDATE invitations SET accepted_by=$2::uuid[],status=$3,session_id=$4 WHERE id=$1 RETURNING *",[sqlUuid(r.id),accepted,sessionId?"accepted":"pending",sqlUuid(sessionId??null)])).rows[0];
        return invitation(next);
      });
    },
    async getInvitations(actorId) {
      actor(actorId); await expire(db);
      return (await db.query<InvitationRow>("SELECT * FROM invitations WHERE from_user=$1 OR to_user=$1 ORDER BY created_at DESC LIMIT 50",[sqlUuid(actorId)])).rows.map(invitation);
    },
    async getInvitation(actorId,id) { await expire(db); return invitation(await invitationFor(db,actorId,id)); },
    async getSession(actorId,id) {
      await member(db,actorId,id);
      const r=(await db.query<SessionRow>("SELECT * FROM learning_sessions WHERE id=$1",[sqlUuid(id)])).rows[0];
      const participants=(await db.query<{learner_id:string}>("SELECT learner_id FROM session_members WHERE session_id=$1 ORDER BY learner_id",[sqlUuid(id)])).rows.map(x=>x.learner_id);
      const messages=(await db.query<MessageRow>("SELECT * FROM session_messages WHERE session_id=$1 ORDER BY created_at,id",[sqlUuid(id)])).rows.map(message);
      return {id:r.id,invitationId:r.invitation_id,conceptSlug:r.concept_slug,participants,createdAt:Number(r.created_at),endedAt:r.ended_at?Number(r.ended_at):undefined,summary:r.summary,context:r.context,messages};
    },
    async appendMessage(actorId, sessionId, text, options) {
      if (!text.trim() || text.length>12000 || !options.idempotencyKey || options.idempotencyKey.length>200) bad("Invalid message");
      return db.transaction(async tx=>{
        await member(tx,actorId,sessionId);
        const s=(await tx.query<SessionRow>("SELECT * FROM learning_sessions WHERE id=$1 FOR UPDATE",[sqlUuid(sessionId)])).rows[0];
        if (s.ended_at) bad("Session has ended");
        const peers=(await tx.query<{learner_id:string}>("SELECT learner_id FROM session_members WHERE session_id=$1 AND learner_id<>$2",[sqlUuid(sessionId),sqlUuid(actorId)])).rows;
        for (const p of peers) if (await blocked(tx,actorId,p.learner_id)) bad("This connection is blocked");
        const kind=options.kind??"human";
        await tx.query("INSERT INTO session_messages(id,session_id,author_id,kind,body,provenance,idempotency_key,submitted_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING",[sqlUuid(randomUUID()),sqlUuid(sessionId),sqlUuid(kind==="human"?actorId:null),kind,text.trim(),options.provenance?json(options.provenance):null,options.idempotencyKey,sqlUuid(actorId),Date.now()]);
        const saved=(await tx.query<MessageRow & {payload_matches:boolean}>("SELECT *, body=$4 AND kind=$5 AND (provenance IS NOT DISTINCT FROM $6::jsonb) AS payload_matches FROM session_messages WHERE session_id=$1 AND submitted_by=$2 AND idempotency_key=$3",[sqlUuid(sessionId),sqlUuid(actorId),options.idempotencyKey,text.trim(),kind,options.provenance?json(options.provenance):null])).rows[0];
        if(!saved.payload_matches) bad("Idempotency key belongs to another message payload");
        return message(saved);
      });
    },
    async completeSession(actorId, sessionId, summary=[]) {
      await db.transaction(async tx=>{
        await member(tx,actorId,sessionId);
        const s=(await tx.query<SessionRow>("SELECT * FROM learning_sessions WHERE id=$1 FOR UPDATE",[sqlUuid(sessionId)])).rows[0];
        if (s.ended_at) return;
        const participants=(await tx.query<{learner_id:string}>("SELECT learner_id FROM session_members WHERE session_id=$1",[sqlUuid(sessionId)])).rows;
        const now=Date.now();
        const contributors=(await tx.query<{author_id:string}>("SELECT DISTINCT author_id FROM session_messages WHERE session_id=$1 AND kind='human' AND author_id IS NOT NULL",[sqlUuid(sessionId)])).rows.map(r=>r.author_id);
        const credited=participants.length>=2 && participants.every(p=>contributors.includes(p.learner_id));
        const context={...s.context,completion:{humanParticipants:contributors.length,credited,evidence:"participation-only; not proof of understanding"}};
        await tx.query("UPDATE learning_sessions SET ended_at=$2,summary=$3,context=$4 WHERE id=$1",[sqlUuid(sessionId),now,json(summary.slice(0,10).map(x=>x.slice(0,1000))),json(context)]);
        // Exactly one event per learner, only after both participated. All
        // projections use the same TypeScript replay; this is a product heuristic.
        if (credited) {
          const inv = (await tx.query<{from_user:string;to_user:string}>("SELECT from_user,to_user FROM invitations WHERE id=$1", [sqlUuid(s.invitation_id)])).rows[0];
          for (const p of participants) {
            const topic = p.learner_id === inv.to_user && typeof s.context.peerConceptSlug === "string" ? s.context.peerConceptSlug : s.concept_slug;
            await record(tx,p.learner_id,{slug:topic,kind:"session",payload:{sessionId,with:participants.find(x=>x.learner_id!==p.learner_id)?.learner_id,evidence:"participation"},idempotencyKey:`session:${sessionId}`,at:now});
          }
        }
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
        await tx.query("INSERT INTO blocks(blocker,blocked,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[sqlUuid(actorId),sqlUuid(peerId),now]);
        await tx.query("UPDATE invitations SET status='declined' WHERE status='pending' AND ((from_user=$1 AND to_user=$2) OR(from_user=$2 AND to_user=$1))",[sqlUuid(actorId),sqlUuid(peerId)]);
        // A block closes active shared rooms immediately, without recording a
        // learning event. A later completion retry observes ended_at and exits.
        await tx.query("UPDATE learning_sessions s SET ended_at=$3,summary=$4,context=context || $5::jsonb WHERE ended_at IS NULL AND EXISTS(SELECT 1 FROM session_members sm WHERE sm.session_id=s.id AND sm.learner_id=$1) AND EXISTS(SELECT 1 FROM session_members sm WHERE sm.session_id=s.id AND sm.learner_id=$2)",[sqlUuid(actorId),sqlUuid(peerId),now,json(["This session was closed after a participant blocked the connection."]),json({completion:{credited:false,reason:"blocked",evidence:"no learning credit recorded"}})]);
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
      await db.query("INSERT INTO reports(id,reporter,reported,session_id,reason,created_at) VALUES($1,$2,$3,$4,$5,$6)",[sqlUuid(id),sqlUuid(actorId),sqlUuid(peerId),sqlUuid(sessionId??null),reason.trim(),Date.now()]);
      return id;
    },
    async beginAgentRun(input) {
      await getProfile(db,input.actorId);
      if (input.parentRunId) {
        const parent=(await db.query("SELECT id FROM agent_runs WHERE id=$1 AND learner_id=$2",[sqlUuid(input.parentRunId),sqlUuid(input.actorId)])).rows;
        if (!parent.length) bad("Parent run not found");
      }
      const r:AgentRunRecord={...input,status:"running",createdAt:Date.now()};
      await db.query("INSERT INTO agent_runs(id,learner_id,agent_id,parent_run_id,status,input_json,model,provider,created_at) VALUES($1,$2,$3,$4,'running',$5,$6,$7,$8)",[sqlUuid(r.id),sqlUuid(r.actorId),r.agentId,sqlUuid(r.parentRunId??null),json(r.input),r.model??null,r.provider??null,r.createdAt]);
      return r;
    },
    async finishAgentRun(actorId,runId,result) {
      const changed=await db.query("UPDATE agent_runs SET status=$3,output_json=$4,error=$5,model=COALESCE($6,model),provider=COALESCE($7,provider),finished_at=$8 WHERE id=$1 AND learner_id=$2 AND status='running' RETURNING id",[sqlUuid(runId),sqlUuid(actorId),result.error?"failed":"succeeded",result.output?json(result.output):null,result.error?.slice(0,2000)??null,result.model??null,result.provider??null,Date.now()]);
      if (!changed.rows.length) bad("Agent run not found or already finished");
    },
    async getAgentRun(actorId,runId) {
      actor(actorId);if(!uuid(runId)) bad("Invalid run id");
      const r=(await db.query<RunRow>("SELECT * FROM agent_runs WHERE learner_id=$1 AND id=$2",[sqlUuid(actorId),sqlUuid(runId)])).rows[0];
      return r?runRecord(r):null;
    },
    async getAgentRuns(actorId,limit=50) {
      actor(actorId);
      return (await db.query<RunRow>("SELECT * FROM agent_runs WHERE learner_id=$1 ORDER BY created_at DESC LIMIT $2",[sqlUuid(actorId),Math.max(1,Math.min(limit,100))])).rows.map(runRecord);
    },
    async getLatestKnowledgeOverviewRun(actorId,sourceHash,mode) {
      actor(actorId);
      const row=(await db.query<RunRow>(`SELECT * FROM agent_runs
        WHERE learner_id=$1 AND agent_id='knowledge-map'
          AND input_json->>'objective'='summarize' AND input_json->>'sourceHash'=$2
          AND input_json->>'summaryMode'=$3 AND COALESCE(input_json->>'derivedCache','false')<>'true'
        ORDER BY COALESCE((input_json->>'overviewAttemptNumber')::bigint,0) DESC,created_at DESC,id DESC LIMIT 1`,[sqlUuid(actorId),sourceHash,mode])).rows[0];
      return row?runRecord(row):null;
    },
    async getLatestLessonRun(actorId,concept,instruction,mode) {
      actor(actorId);
      // Match the complete instruction, which includes depth and the lesson recipe.
      // Later prompt versions do not silently reuse an incompatible lesson. The
      // query is owner-scoped and independent of unrelated recent-run pagination.
      const row=(await db.query<RunRow>(`SELECT * FROM agent_runs
        WHERE learner_id=$1 AND agent_id='learning-companion' AND status='succeeded'
          AND input_json->>'mode'='solo' AND input_json->>'concept'=$2
          AND input_json->>'message'=$3 AND output_json->>'mode'=$4
        ORDER BY finished_at DESC,created_at DESC,id DESC LIMIT 1`,[sqlUuid(actorId),concept,instruction,mode])).rows[0];
      return row?runRecord(row):null;
    },
    async saveMedia(input) {
      await getProfile(db,input.actorId);
      const r={...input,id:randomUUID(),createdAt:Date.now()};
      await db.query("INSERT INTO media_assets(id,learner_id,kind,mime_type,local_path,content_hash,byte_size,extracted_text,provenance,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[sqlUuid(r.id),sqlUuid(r.actorId),r.kind,r.mimeType,r.localPath,r.contentHash,r.byteSize,r.extractedText??null,r.provenance?json(r.provenance):null,r.createdAt]);
      return r;
    },
    async getMedia(actorId,id) {
      actor(actorId);
      type R={id:string;learner_id:string;kind:MediaRecord["kind"];mime_type:string;local_path:string;content_hash:string;byte_size:number;extracted_text?:string;provenance?:Provenance;created_at:number};
      const r=(await db.query<R>("SELECT * FROM media_assets WHERE id=$1 AND learner_id=$2",[sqlUuid(id),sqlUuid(actorId)])).rows[0];
      if(!r) throw new DataError("Media not found","NOT_FOUND");
      return {id:r.id,actorId:r.learner_id,kind:r.kind,mimeType:r.mime_type,localPath:r.local_path,contentHash:r.content_hash,byteSize:Number(r.byte_size),extractedText:r.extracted_text??undefined,provenance:r.provenance??undefined,createdAt:Number(r.created_at)};
    },
    async putVector(r) {
      await db.transaction(async tx => {
        await putVector(tx,r);
        await tx.query("UPDATE retrieval_index_jobs SET status='ready',last_error=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=$7 WHERE learner_id=$1 AND entity_type=$2 AND entity_id=$3 AND model=$4 AND model_revision=$5 AND content_hash=$6 AND status<>'processing'", [sqlUuid(r.actorId),r.entityType,r.entityId,r.model,r.modelRevision,r.contentHash,Date.now()]);
      });
    },
    async searchVectors(actorId,vector,options) {
      actor(actorId); validateVector(vector);
      type R={entity_type:VectorRecord["entityType"];entity_id:string;text_content:string;similarity:number;model:string;model_revision:string};
      const rows=(await db.query<R>(`SELECT entity_type,entity_id,text_content,1-(embedding <=> $2::vector) AS similarity,model,model_revision FROM retrieval_vectors v WHERE learner_id=$1 AND model=$3 AND model_revision=$4 AND ($5::text IS NULL OR entity_type=$5)
        AND NOT EXISTS(SELECT 1 FROM retrieval_index_jobs j WHERE j.learner_id=v.learner_id AND j.entity_type=v.entity_type AND j.entity_id=v.entity_id AND j.model=v.model AND j.model_revision=v.model_revision AND (j.status<>'ready' OR j.content_hash<>v.content_hash))
        ORDER BY embedding <=> $2::vector LIMIT $6`,[sqlUuid(actorId),json(vector),options.model,options.modelRevision,options.entityType??null,Math.max(1,Math.min(options.limit??10,50))])).rows;
      return rows.map(r=>({entityType:r.entity_type,entityId:r.entity_id,text:r.text_content,similarity:Number(r.similarity),model:r.model,modelRevision:r.model_revision} satisfies VectorHit));
    },
    async enqueueIndexItems(actorId, items, space) {
      await getProfile(db, actorId);
      await db.transaction(tx => enqueue(tx, actorId, items, space));
      return indexStatus(db, actorId, space);
    },
    async reconcileIndex(actorId, space) {
      await db.transaction(async tx => {
        const p = await getProfile(tx, actorId);
        const concepts = (await tx.query<ConceptRow>("SELECT c.* FROM concepts c JOIN learner_concepts lc ON lc.concept_slug=c.slug WHERE lc.learner_id=$1", [sqlUuid(actorId)])).rows;
        await enqueue(tx, actorId, concepts.map(c => ({ entityType: "concept" as const, entityId: c.slug, text: `${c.title}. ${c.hook}` })), space);
        if (p.currentIntent.trim()) await enqueue(tx, actorId, [{ entityType: "intent", entityId: "current", text: p.currentIntent }], space);
        else { await tx.query("DELETE FROM retrieval_index_jobs WHERE learner_id=$1 AND entity_type='intent' AND entity_id='current'", [sqlUuid(actorId)]); await tx.query("DELETE FROM retrieval_vectors WHERE learner_id=$1 AND entity_type='intent' AND entity_id='current'", [sqlUuid(actorId)]); }
        await reconcileMetadata(tx,actorId,space);
      });
      return indexStatus(db, actorId, space);
    },
    async getIndexStatus(actorId, space) { await getProfile(db, actorId); return indexStatus(db, actorId, space); },
    async claimIndexJobs(actorId, space, limit = 16, leaseMs = 90_000) {
      actor(actorId); checkSpace(space);
      return db.transaction(async tx => {
        const now = Date.now();
        const rows = (await tx.query<JobRow>(`SELECT * FROM retrieval_index_jobs WHERE learner_id=$1 AND model=$2 AND model_revision=$3
          AND ((status IN ('pending','retry') AND not_before<=$4) OR (status='processing' AND lease_expires_at<=$4))
          ORDER BY created_at,id LIMIT $5 FOR UPDATE SKIP LOCKED`, [sqlUuid(actorId),space.model,space.modelRevision,now,Math.max(1,Math.min(limit,16))])).rows;
        const claimed: IndexJob[] = [];
        for (const row of rows) {
          const token = randomUUID();
          const changed = (await tx.query<JobRow>("UPDATE retrieval_index_jobs SET status='processing',attempts=attempts+1,lease_token=$2,lease_expires_at=$3,last_error=NULL,updated_at=$4 WHERE id=$1 RETURNING *", [sqlUuid(row.id),sqlUuid(token),now+Math.max(100,Math.min(leaseMs,300_000)),now])).rows[0];
          claimed.push(indexJob(changed));
        }
        return claimed;
      });
    },
    async completeIndexJob(actorId, jobId, leaseToken, vector) {
      actor(actorId); validateVector(vector);
      return db.transaction(async tx => {
        const r = (await tx.query<JobRow>("SELECT * FROM retrieval_index_jobs WHERE id=$1 AND learner_id=$2 FOR UPDATE", [sqlUuid(jobId),sqlUuid(actorId)])).rows[0];
        if (!r || r.status !== "processing" || r.lease_token !== leaseToken || Number(r.lease_expires_at) <= Date.now()) return false;
        // A source edit atomically invalidates the lease; reconciling also repairs
        // old model spaces. Never publish a result into another content version.
        if (r.entity_type === "intent" && (await getProfile(tx, actorId)).currentIntent !== r.text_content) return false;
        if (r.entity_type === "concept") {
          const c = (await tx.query<{title:string;hook:string}>("SELECT c.title,c.hook FROM concepts c JOIN learner_concepts lc ON lc.concept_slug=c.slug WHERE c.slug=$1 AND lc.learner_id=$2", [r.entity_id,sqlUuid(actorId)])).rows[0];
          if (!c || contentHash(`${c.title}. ${c.hook}`) !== r.content_hash) return false;
        }
        if (r.entity_type === "metadata") {
          const current = (await tx.query<{id:string;values_json:Json}>("SELECT id,values_json FROM inferred_metadata WHERE learner_id=$1 AND kind='intent-proposal' ORDER BY created_at DESC,id DESC LIMIT 1", [sqlUuid(actorId)])).rows[0];
          const text = current ? metadataIndexText(current.values_json) : null;
          if (!text || current.id !== r.entity_id || contentHash(text) !== r.content_hash) return false;
        }
        await putVector(tx, { id: randomUUID(), actorId, entityType: r.entity_type, entityId: r.entity_id, text: r.text_content, contentHash: r.content_hash, vector, model: r.model, modelRevision: r.model_revision, dimensions: 768, mode: "local-meta" });
        await tx.query("UPDATE retrieval_index_jobs SET status='ready',lease_token=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=$2 WHERE id=$1", [sqlUuid(jobId),Date.now()]);
        return true;
      });
    },
    async failIndexJob(actorId, jobId, leaseToken, safeError) {
      actor(actorId);
      // Caller supplies a fixed, learner-safe label rather than a provider body.
      const error = safeError.slice(0,200);
      await db.query("UPDATE retrieval_index_jobs SET status='retry',not_before=$4+LEAST(60000,2000*POWER(2,LEAST(attempts-1,5))),lease_token=NULL,lease_expires_at=NULL,last_error=$5,updated_at=$4 WHERE id=$1 AND learner_id=$2 AND status='processing' AND lease_token=$3", [sqlUuid(jobId),sqlUuid(actorId),sqlUuid(leaseToken),Date.now(),error]);
    },
    async getOwnedVectors(actorId, options) {
      actor(actorId); checkSpace(options);
      type R = { id: string; entity_type: VectorRecord["entityType"]; entity_id: string; text_content: string; embedding: string | number[]; model: string; model_revision: string; content_hash: string; created_at: number };
      const rows = (await db.query<R>(`SELECT v.* FROM retrieval_vectors v WHERE v.learner_id=$1 AND v.model=$2 AND v.model_revision=$3
        AND ($4::text IS NULL OR v.entity_type=$4) AND ($5::text[] IS NULL OR v.entity_id=ANY($5::text[]))
        AND NOT EXISTS(SELECT 1 FROM retrieval_index_jobs j WHERE j.learner_id=v.learner_id AND j.entity_type=v.entity_type AND j.entity_id=v.entity_id AND j.model=v.model AND j.model_revision=v.model_revision AND (j.status<>'ready' OR j.content_hash<>v.content_hash)) ORDER BY v.entity_type,v.entity_id`, [sqlUuid(actorId),options.model,options.modelRevision,options.entityType??null,options.entityIds??null])).rows;
      const p = await getProfile(db,actorId);
      const canonical = new Map((await db.query<ConceptRow>("SELECT c.* FROM concepts c JOIN learner_concepts lc ON lc.concept_slug=c.slug WHERE lc.learner_id=$1", [sqlUuid(actorId)])).rows.map(c=>[c.slug,contentHash(`${c.title}. ${c.hook}`)]));
      const latest = (await db.query<{id:string;values_json:Json}>("SELECT id,values_json FROM inferred_metadata WHERE learner_id=$1 AND kind='intent-proposal' ORDER BY created_at DESC,id DESC LIMIT 1", [sqlUuid(actorId)])).rows[0];
      const metadataText = latest ? metadataIndexText(latest.values_json) : null;
      return rows.filter(r => r.entity_type === "concept" ? canonical.get(r.entity_id) === r.content_hash : r.entity_type === "intent" ? r.entity_id === "current" && contentHash(p.currentIntent) === r.content_hash : r.entity_type === "metadata" ? latest?.id === r.entity_id && !!metadataText && contentHash(metadataText) === r.content_hash : true).map(r => ({ id:r.id,actorId,entityType:r.entity_type,entityId:r.entity_id,text:r.text_content,vector:typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding,model:r.model,modelRevision:r.model_revision,dimensions:768 as const,contentHash:r.content_hash,mode:"local-meta" as const,createdAt:Number(r.created_at) }));
    },
    async searchPeerVectors(actorId, options) {
      actor(actorId); checkSpace(options);
      const s = await repository.getSnapshot(actorId);
      const requested = options.conceptSlugs === undefined ? undefined : new Set(options.conceptSlugs);
      if (requested && [...requested].some(slug => !s.nodes[slug])) bad("Choose concepts from your own saved map");
      const own = Object.values(s.nodes).filter(n=>requested ? requested.has(n.slug) : n.interest>=.2).sort((a,b)=>b.interest-a.interest||a.slug.localeCompare(b.slug)).slice(0,requested ? 100 : 5);
      const peerIds = options.peerIds === undefined ? undefined : new Set(options.peerIds);
      // A willing person without any active topic has no vector projection to
      // build. They must not keep everybody else's discovery permanently busy.
      const peers = (await repository.listCandidates(actorId)).filter(p=>p.activeConcepts.length>0&&(!peerIds||peerIds.has(p.id)));
      const sources = new Map((await db.query<ConceptRow>("SELECT * FROM concepts WHERE slug=ANY($1::text[])", [[...new Set([...own.map(n=>n.slug),...peers.flatMap(p=>p.activeConcepts)])]])).rows.map(c=>[c.slug,{title:c.title,hash:contentHash(`${c.title}. ${c.hook}`)}]));
      const queries = own.map(n=>({slug:n.slug,hash:sources.get(n.slug)!.hash}));
      const targets = peers.flatMap(p=>p.activeConcepts.map(slug=>({peer_id:p.id,slug,hash:sources.get(slug)?.hash}))).filter(p=>p.hash);
      type Hit = { peer_id: string; own_slug: string; peer_slug: string; similarity: number };
      const fresh = `NOT EXISTS(SELECT 1 FROM retrieval_index_jobs j WHERE j.learner_id=v.learner_id AND j.entity_type=v.entity_type AND j.entity_id=v.entity_id AND j.model=v.model AND j.model_revision=v.model_revision AND (j.status<>'ready' OR j.content_hash<>v.content_hash))`;
      const currentVectors = `SELECT v.* FROM retrieval_vectors v WHERE v.entity_type='concept' AND v.model=$2 AND v.model_revision=$3 AND ${fresh}`;
      const rows = (await db.query<Hit>(`WITH current_vectors AS (${currentVectors}),
        queries AS (SELECT q.* FROM current_vectors q JOIN jsonb_to_recordset($4::jsonb) src(slug text,hash text) ON src.slug=q.entity_id AND src.hash=q.content_hash WHERE q.learner_id=$1),
        targets AS (SELECT p.* FROM current_vectors p JOIN jsonb_to_recordset($5::jsonb) src(peer_id uuid,slug text,hash text) ON src.peer_id=p.learner_id AND src.slug=p.entity_id AND src.hash=p.content_hash),
        ranked AS (SELECT p.learner_id AS peer_id,q.entity_id AS own_slug,p.entity_id AS peer_slug,1-(q.embedding <=> p.embedding) AS similarity,
          ROW_NUMBER() OVER(PARTITION BY q.entity_id ORDER BY q.embedding <=> p.embedding,p.learner_id,p.entity_id) AS position FROM queries q CROSS JOIN targets p)
        SELECT peer_id,own_slug,peer_slug,similarity FROM ranked WHERE position<=$6 ORDER BY own_slug,similarity DESC,peer_id,peer_slug`, [sqlUuid(actorId),options.model,options.modelRevision,json(queries),json(targets),Math.max(1,Math.min(options.limitPerConcept??50,100))])).rows;
      const indexedQueries = await repository.getOwnedVectors(actorId,{...options,entityType:"concept",entityIds:own.map(n=>n.slug)});
      const indexedPeers = new Set<string>();
      for (const peer of peers) if ((await repository.getOwnedVectors(peer.id,{...options,entityType:"concept",entityIds:peer.activeConcepts})).length) indexedPeers.add(peer.id);
      const indexing = indexedQueries.length < own.length || indexedPeers.size < peers.length;
      const ownStatus = await indexStatus(db,actorId,options);
      return { model:options.model,modelRevision:options.modelRevision,status:indexing ? ownStatus.retry && !indexedQueries.length ? "unavailable" : "indexing" : "ready",hits:rows.filter(r=>Number.isFinite(Number(r.similarity))).map(r=>({peerId:r.peer_id,ownConceptSlug:r.own_slug,ownConceptTitle:sources.get(r.own_slug)!.title,peerConceptSlug:r.peer_slug,peerConceptTitle:sources.get(r.peer_slug)!.title,similarity:Number(r.similarity)})),queryCount:own.length,indexedQueryCount:indexedQueries.length,eligiblePeerCount:peers.length,indexedPeerCount:indexedPeers.size };
    },
    async getSnapshot(actorId) {
      const p=await getProfile(db,actorId);
      const cs=(await db.query<ConceptRow>("SELECT c.* FROM concepts c JOIN learner_concepts lc ON lc.concept_slug=c.slug WHERE lc.learner_id=$1 ORDER BY lc.created_at,c.slug",[sqlUuid(actorId)])).rows.map(concept);
      const edges=(await db.query<Edge>("SELECT e.* FROM concept_edges e JOIN learner_concepts a ON a.concept_slug=e.src JOIN learner_concepts b ON b.concept_slug=e.dst WHERE a.learner_id=$1 AND b.learner_id=$1",[sqlUuid(actorId)])).rows;
      const events=await eventsFor(db,actorId);
      const metadata=(await db.query<{id:string;kind:string;values_json:Json;provenance:Provenance;created_at:number}>("SELECT * FROM inferred_metadata WHERE learner_id=$1 ORDER BY created_at DESC LIMIT 100",[sqlUuid(actorId)])).rows.map(r=>({id:r.id,kind:r.kind,values:r.values_json,provenance:r.provenance,createdAt:Number(r.created_at)}));
      const sessionIds=(await db.query<{session_id:string}>("SELECT sm.session_id FROM session_members sm JOIN learning_sessions s ON s.id=sm.session_id WHERE learner_id=$1 ORDER BY s.created_at DESC LIMIT 20",[sqlUuid(actorId)])).rows;
      const sessions:LearningSession[]=[];
      for (const r of sessionIds) sessions.push(await repository.getSession(actorId,r.session_id));
      const peerRows=(await db.query<{id:string;display_name:string}>("SELECT DISTINCT l.id,l.display_name FROM learners l JOIN session_members other ON other.learner_id=l.id JOIN session_members own ON own.session_id=other.session_id WHERE own.learner_id=$1 AND l.id<>$1",[sqlUuid(actorId)])).rows;
      const peerNames=Object.fromEntries(peerRows.map(r=>[r.id,r.display_name]));
      return {mode:"local",actorId,profile:p,concepts:cs,edges,events,nodes:replay(events),metadata,invitations:await repository.getInvitations(actorId),sessions,peerNames} satisfies Snapshot;
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
  shared.__furtherLocalRepository ??= (process.env.FURTHER_DATA_BACKEND === "aurora-data-api"
    ? import("./aurora-data-api").then(({auroraDataApiFromEnvironment}) => createRepository({database:auroraDataApiFromEnvironment()}))
    : createRepository({dataDir:process.env.FURTHER_DATA_DIR ?? resolve(process.cwd(),".local/data/pglite")}))
    .catch(err=>{delete shared.__furtherLocalRepository;throw err;});
  return shared.__furtherLocalRepository;
}
