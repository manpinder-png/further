// Public data contracts. No database driver imports: safe for API/type consumers.
import type { Concept, Edge, EventKind, Explorer, FEvent, Profile, UserNode } from "../../lib/types";

export type Json = Record<string, unknown>;
export interface DataProfile extends Profile { id: string; availableMinutes: number; revision: number }
export interface Provenance {
  source: "user" | "agent" | "system";
  model?: string;
  modelRevision?: string;
  runId?: string;
  confidence?: number;
  confirmed?: boolean;
  schemaVersion: number;
}
export interface MetadataRecord { id: string; kind: string; values: Json; provenance: Provenance; createdAt: number }
export interface PeerCandidate extends Explorer { availableMinutes: number }
export interface Invitation {
  id: string; fromUserId: string; toUserId: string; conceptSlug: string;
  status: "pending" | "accepted" | "declined" | "expired";
  acceptedBy: string[]; sessionId?: string; expiresAt: number; createdAt: number;
  reason: string; score: number; context: Json;
}
export interface SessionMessage {
  id: string; sessionId: string; authorId: string | null;
  kind: "human" | "facilitator" | "system";
  text: string; createdAt: number; provenance?: Provenance;
}
export interface LearningSession {
  id: string; invitationId: string; conceptSlug: string; participants: string[];
  createdAt: number; endedAt?: number; summary: string[]; context: Json;
  messages: SessionMessage[];
}
export interface Snapshot {
  mode: "local"; actorId: string; profile: DataProfile;
  concepts: Concept[]; edges: Edge[]; events: FEvent[];
  nodes: Record<string, UserNode>; metadata: MetadataRecord[];
  invitations: Invitation[]; sessions: LearningSession[];
}
export interface AgentRunRecord {
  id: string; actorId: string; agentId: string; parentRunId?: string;
  status: "running" | "succeeded" | "failed"; input: Json; output?: Json;
  model?: string; provider?: string; error?: string; createdAt: number; finishedAt?: number;
}
export interface MediaRecord {
  id: string; actorId: string; kind: "image" | "audio" | "document";
  mimeType: string; localPath: string; contentHash: string; byteSize: number;
  createdAt: number; extractedText?: string; provenance?: Provenance;
}
export interface VectorRecord {
  id: string; actorId: string; entityType: "concept" | "intent" | "resource_chunk" | "metadata";
  entityId: string; text: string; vector: number[];
  model: string; modelRevision: string; dimensions: 768;
  contentHash: string; mode: "local-meta"; createdAt?: number;
}
export interface VectorHit { entityType: VectorRecord["entityType"]; entityId: string; text: string; similarity: number; model: string; modelRevision: string }

export interface FurtherRepository {
  /** Local development identity chooser only; expose behind the local-only API boundary. */
  listLocalUsers(): Promise<Array<{ id: string; displayName: string }>>;
  ensureUser(actorId: string, displayName?: string): Promise<DataProfile>;
  getProfile(actorId: string): Promise<DataProfile>;
  updateProfile(actorId: string, patch: Partial<Profile> & { availableMinutes?: number }): Promise<DataProfile>;
  getSnapshot(actorId: string): Promise<Snapshot>;
  getConcepts(): Promise<Concept[]>;
  addConcepts(actorId: string, concepts: Concept[], edges?: Edge[]): Promise<void>;
  recordEvent(actorId: string, event: { slug: string; kind: EventKind; payload?: Json; idempotencyKey: string; at?: number }): Promise<FEvent>;
  saveMetadata(actorId: string, kind: string, values: Json, provenance: Provenance): Promise<MetadataRecord>;
  heartbeat(actorId: string, ttlMs?: number): Promise<void>;
  listCandidates(actorId: string): Promise<PeerCandidate[]>;
  invite(actorId: string, peerId: string, conceptSlug: string, options?: { reason?: string; score?: number; context?: Json; ttlMs?: number }): Promise<Invitation>;
  respondToInvite(actorId: string, invitationId: string, decision: "accept" | "decline"): Promise<Invitation>;
  getInvitations(actorId: string): Promise<Invitation[]>;
  getInvitation(actorId: string, invitationId: string): Promise<Invitation>;
  getSession(actorId: string, sessionId: string): Promise<LearningSession>;
  appendMessage(actorId: string, sessionId: string, text: string, options: { kind?: SessionMessage["kind"]; idempotencyKey: string; provenance?: Provenance }): Promise<SessionMessage>;
  completeSession(actorId: string, sessionId: string, summary?: string[]): Promise<LearningSession>;
  block(actorId: string, peerId: string): Promise<void>;
  isBlocked(actorId: string, peerId: string): Promise<boolean>;
  report(actorId: string, peerId: string, reason: string, sessionId?: string): Promise<string>;
  beginAgentRun(record: Omit<AgentRunRecord, "status" | "createdAt">): Promise<AgentRunRecord>;
  finishAgentRun(actorId: string, runId: string, result: { output?: Json; error?: string; model?: string; provider?: string }): Promise<void>;
  getAgentRun(actorId: string, runId: string): Promise<AgentRunRecord | null>;
  getAgentRuns(actorId: string, limit?: number): Promise<AgentRunRecord[]>;
  saveMedia(record: Omit<MediaRecord, "id" | "createdAt">): Promise<MediaRecord>;
  getMedia(actorId: string, mediaId: string): Promise<MediaRecord>;
  putVector(record: VectorRecord): Promise<void>;
  searchVectors(actorId: string, vector: number[], options: { model: string; modelRevision: string; limit?: number; entityType?: VectorRecord["entityType"] }): Promise<VectorHit[]>;
  close(): Promise<void>;
}
