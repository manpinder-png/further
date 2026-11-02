import { z } from "zod";
import type { Invitation, FurtherRepository, LearningSession, Snapshot, PeerCandidate } from "../data/contracts";
import type { MatchRequest } from "../../lib/types";
import type { GeomindTopicPair } from "../../lib/geomind";
import { MATCH_THRESHOLD, SEMANTIC_MATCHING_VERSION, SEMANTIC_PAIR_BAND, SEMANTIC_PAIR_LIMIT, semanticOperatingPoint, scoreSemanticFit, type PairScore } from "../../lib/matching";
import { slug } from "../../lib/schemas";
import { HttpError } from "./http";
import { EMBEDDING_MODEL, EMBEDDING_REVISION, search } from "../retrieval/client";

export const MatchConceptScope = z.array(slug).min(1).max(100);

export function scopeFor(snapshot: Snapshot, conceptSlugs?: string[]) {
  if (conceptSlugs === undefined) return undefined;
  const scope = new Set(MatchConceptScope.parse(conceptSlugs));
  const own = new Set(snapshot.concepts.map(concept => concept.slug));
  if ([...scope].some(concept => !own.has(concept))) throw new HttpError(400, "Choose topics from your own saved learning path.");
  return scope;
}

export interface RankedSemanticPeer extends PairScore {
  peer: PeerCandidate;
  semanticSimilarity: number;
  topicPairs: GeomindTopicPair[];
  commonMinutes: number;
  timeFit: number;
}

function operatingPoint() {
  const configured = process.env.FURTHER_PEER_MIN_SIMILARITY;
  if (configured !== undefined) {
    const value = Number(configured);
    if (process.env.FURTHER_PEER_EMBEDDING_REVISION !== EMBEDDING_REVISION || !configured.trim() || !Number.isFinite(value) || value < -1 || value > 1) {
      throw new HttpError(503, "Semantic discovery needs a valid operating point for the current encoder version.");
    }
    return { minSimilarity: value, calibration: "experimental" as const };
  }
  return semanticOperatingPoint(EMBEDDING_MODEL, EMBEDDING_REVISION);
}

/** One source of semantic candidates for Geomind, the peer tool and invitations. */
export async function semanticPeerSearch(repo: FurtherRepository, actorId: string, conceptSlugs?: string[]) {
  const snapshot = await repo.getSnapshot(actorId);
  const scope = scopeFor(snapshot, conceptSlugs);
  const active = Object.values(snapshot.nodes)
    .filter(node => scope ? scope.has(node.slug) : node.interest >= .2)
    .sort((a, b) => b.interest - a.interest || a.slug.localeCompare(b.slug)).slice(0, 5);
  const policy = operatingPoint();
  const baseIndex = { status: "ready" as "ready" | "indexing" | "unavailable", model: EMBEDDING_MODEL, modelRevision: EMBEDDING_REVISION, indexedConcepts: 0, concepts: active.length,
    ...(policy ? policy : {}) };
  if (!snapshot.profile.openToMatch || !snapshot.profile.staticProfile.age18Plus || snapshot.profile.availableMinutes < 10 || !active.length) {
    return { snapshot, active, ranked: [] as RankedSemanticPeer[], index: baseIndex };
  }
  if (!policy) return { snapshot, active, ranked: [] as RankedSemanticPeer[], index: { ...baseIndex, status: "unavailable" as const } };
  const peers = await repo.listCandidates(actorId);
  const eligible = new Map(peers.filter(peer => Math.min(peer.availableMinutes, snapshot.profile.availableMinutes) >= 10).map(peer => [peer.id, peer]));
  const vectorResult = await repo.searchPeerVectors(actorId, {
    conceptSlugs: active.map(node => node.slug), model: EMBEDDING_MODEL, modelRevision: EMBEDDING_REVISION,
    limitPerConcept: 120, peerIds: [...eligible.keys()],
  });
  const pairs = new Map<string, GeomindTopicPair[]>();
  for (const hit of vectorResult.hits) {
    const peer = eligible.get(hit.peerId);
    // Defense in depth: candidate identity and public topic membership remain
    // checked after retrieval, never granted by a similarity score.
    if (!peer || !active.some(node => node.slug === hit.ownConceptSlug) || !peer.activeConcepts.includes(hit.peerConceptSlug)
      || !Number.isFinite(hit.similarity) || hit.similarity < policy.minSimilarity) continue;
    const list = pairs.get(peer.id) ?? [];
    if (!list.some(pair => pair.ownTopic.slug === hit.ownConceptSlug && pair.peerTopic.slug === hit.peerConceptSlug)) {
      list.push({ ownTopic: { slug: hit.ownConceptSlug, title: hit.ownConceptTitle }, peerTopic: { slug: hit.peerConceptSlug, title: hit.peerConceptTitle }, similarity: Math.max(-1, Math.min(1, hit.similarity)) });
    }
    pairs.set(peer.id, list);
  }
  const ranked: RankedSemanticPeer[] = [];
  for (const [peerId, related] of pairs) {
    const peer = eligible.get(peerId)!;
    related.sort((a, b) => b.similarity - a.similarity || a.ownTopic.slug.localeCompare(b.ownTopic.slug) || a.peerTopic.slug.localeCompare(b.peerTopic.slug));
    const best = related[0];
    // The absolute floor alone admits weak cross-topic pairings. Advertise only
    // the strongest relative band for each person, with bounded stable ties.
    const retained = related.filter(pair => pair.similarity >= Math.max(policy.minSimilarity, best.similarity - SEMANTIC_PAIR_BAND)).slice(0, SEMANTIC_PAIR_LIMIT);
    const fit = scoreSemanticFit({ similarity: best.similarity, ownExplanation: snapshot.nodes[best.ownTopic.slug]?.mastery ?? 0,
      peerExplanation: peer.mastery[best.peerTopic.slug] ?? 0, ownMinutes: snapshot.profile.availableMinutes, peerMinutes: peer.availableMinutes });
    const peerTopics = new Set(retained.map(pair => pair.peerTopic.slug));
    const projectedPeer = { ...peer, activeConcepts: peer.activeConcepts.filter(topic => peerTopics.has(topic)), mastery: Object.fromEntries(Object.entries(peer.mastery).filter(([topic]) => peerTopics.has(topic))) };
    const peerReviewed = (peer.mastery[best.peerTopic.slug] ?? 0) >= 2 / 3;
    const ownReviewed = (snapshot.nodes[best.ownTopic.slug]?.mastery ?? 0) >= 2 / 3;
    ranked.push({ peer: projectedPeer, score: fit.score, semanticSimilarity: fit.semanticSimilarity, overlap: fit.semanticSimilarity,
      complementarity: fit.explanationEvidence, recency: 1, timeFit: fit.timeFit, commonMinutes: Math.min(snapshot.profile.availableMinutes, peer.availableMinutes),
      topicPairs: retained,
      ...(peerReviewed || ownReviewed ? { teach: { from: peerReviewed ? "b" as const : "a" as const,
        slug: peerReviewed ? best.peerTopic.slug : best.ownTopic.slug, near: best.ownTopic.slug } } : {}),
    });
  }
  ranked.sort((a, b) => b.score - a.score || b.semanticSimilarity - a.semanticSimilarity || a.peer.id.localeCompare(b.peer.id));
  return { snapshot, active, ranked, index: { ...baseIndex, status: vectorResult.status, indexedConcepts: vectorResult.indexedQueryCount } };
}

export async function rankedPeers(repo: FurtherRepository, actorId: string, conceptSlugs?: string[], query?: string) {
  // Do not invoke the encoder merely to discover that discovery is disabled or
  // no eligible person exists. These are valid empty states, not fallback ranks.
  const owner = await repo.getSnapshot(actorId);
  scopeFor(owner, conceptSlugs);
  if (!owner.profile.openToMatch || !owner.profile.staticProfile.age18Plus || owner.profile.availableMinutes < 10 || !owner.concepts.length) return [];
  if (!(await repo.listCandidates(actorId)).length) return [];
  // A typed guide query recalls relevant OWN saved concepts. It is never used
  // to expose a peer's private intent or to grant sharing permission.
  if (query?.trim() && !conceptSlugs) {
    if (!(await repo.getOwnedVectors(actorId, { model: EMBEDDING_MODEL, modelRevision: EMBEDDING_REVISION, entityType: "concept" })).length) {
      throw new HttpError(503, "Your learning map is not yet indexed for semantic search. Try again after indexing finishes.");
    }
    try {
      const hits = await search(repo, actorId, query.trim());
      const policy = operatingPoint();
      if (!policy) throw new Error("Unregistered encoder space");
      conceptSlugs = hits.filter(hit => hit.entityType === "concept" && hit.similarity >= policy.minSimilarity).map(hit => hit.entityId).slice(0, 5);
    } catch { throw new HttpError(503, "Your local semantic search is unavailable. Your saved map has not changed."); }
    if (!conceptSlugs.length) return [];
  }
  const result = await semanticPeerSearch(repo, actorId, conceptSlugs);
  if (result.index.status === "unavailable" && !result.ranked.length) throw new HttpError(503, "Semantic discovery is unavailable for the current index. Your saved map has not changed.");
  if (result.index.status !== "ready" && !result.ranked.length) throw new HttpError(409, "Your learning map is still being indexed for semantic discovery. Try again shortly.");
  return result.ranked;
}

export async function toMatch(repo: FurtherRepository, actorId: string, inv: Invitation): Promise<MatchRequest> {
  const peerId = inv.fromUserId === actorId ? inv.toUserId : inv.fromUserId;
  const peerProfile = await repo.getProfile(peerId);
  const fromStrong = String(inv.context.fromStrong ?? inv.conceptSlug);
  const toStrong = String(inv.context.toStrong ?? inv.conceptSlug);
  const peerStrong = actorId === inv.fromUserId ? toStrong : fromStrong;
  return {
    id: inv.id, peer: { id: peerId, name: peerProfile.displayName, demo: false, activeConcepts: [peerStrong], mastery: {}, openToMatch: peerProfile.openToMatch, language: peerProfile.language, lastActive: inv.createdAt, color: "#4ddfe6" },
    concept: actorId === inv.fromUserId ? inv.conceptSlug : String(inv.context.peerConceptSlug ?? inv.conceptSlug), peerStrong, youStrong: actorId === inv.fromUserId ? fromStrong : toStrong,
    reason: inv.reason, score: inv.score, expiresAt: inv.expiresAt,
    status: inv.status === "pending" && inv.acceptedBy.includes(actorId) ? "waiting" : inv.status,
    sessionId: inv.sessionId,
  };
}

export async function currentMatch(repo: FurtherRepository, actorId: string) {
  const all = await repo.getInvitations(actorId);
  for (const inv of all) {
    if (inv.status === "pending") return toMatch(repo,actorId,inv);
    if (inv.status === "accepted" && inv.sessionId) {
      const session = await repo.getSession(actorId,inv.sessionId);
      if (!session.endedAt) return toMatch(repo,actorId,inv);
    }
  }
  return null;
}

export async function suggestMatch(repo: FurtherRepository, actorId: string, conceptSlugs?: string[]) {
  scopeFor(await repo.getSnapshot(actorId), conceptSlugs);
  await repo.heartbeat(actorId);
  const existing = await currentMatch(repo,actorId);
  // An agreed invitation/room survives switching the local view and index work.
  if (existing) return { threshold: MATCH_THRESHOLD, ranked: [], match: existing, demo: false };
  const { ranked, index } = await semanticPeerSearch(repo, actorId, conceptSlugs);
  // A verified current pair remains usable while a different eligible learner
  // is indexing. Keep global coverage visible without making it a pair gate.
  const best = ranked.find(r => r.score >= MATCH_THRESHOLD);
  if (!best) return { threshold: MATCH_THRESHOLD, ranked, index, match: null, demo: false };
  const match = await createSemanticInvitation(repo, actorId, best, best.topicPairs[0]);
  return { threshold: MATCH_THRESHOLD, ranked, index, match, demo: false };
}

/** Only server-produced, freshly retrieved topic pairs reach persistence. */
export async function createSemanticInvitation(repo: FurtherRepository, actorId: string, peer: RankedSemanticPeer, pair: GeomindTopicPair) {
  const same = pair.ownTopic.slug === pair.peerTopic.slug;
  const inv = await repo.invite(actorId, peer.peer.id, pair.ownTopic.slug, {
    score: peer.score,
    reason: same ? `You both want to explore ${pair.ownTopic.title}. Exchange what you know and work through one question together.`
      : `${pair.ownTopic.title} connects with ${peer.peer.name}'s interest in ${pair.peerTopic.title}. Compare your questions and explore the connection together.`,
    context: { fromStrong: pair.ownTopic.slug, toStrong: pair.peerTopic.slug, shared: pair.ownTopic.slug,
      peerConceptSlug: pair.peerTopic.slug, semanticMatchingVersion: SEMANTIC_MATCHING_VERSION,
      semanticSimilarity: pair.similarity, embeddingModel: EMBEDDING_MODEL, embeddingRevision: EMBEDDING_REVISION },
  });
  const sender = inv.fromUserId === actorId;
  const returnedPeer = sender ? inv.toUserId : inv.fromUserId;
  const returnedOwnTopic = sender ? inv.conceptSlug : String(inv.context.peerConceptSlug ?? inv.conceptSlug);
  const returnedPeerTopic = sender ? String(inv.context.peerConceptSlug ?? inv.conceptSlug) : inv.conceptSlug;
  if (returnedPeer !== peer.peer.id || returnedOwnTopic !== pair.ownTopic.slug || returnedPeerTopic !== pair.peerTopic.slug) {
    throw new HttpError(409, "A different invitation is already in progress. Return to your current invitation.");
  }
  return toMatch(repo, actorId, inv);
}

export async function roomView(repo: FurtherRepository, actorId: string, session: LearningSession) {
  const invitation = await repo.getInvitation(actorId,session.invitationId);
  const match = await toMatch(repo,actorId,invitation);
  return { id:session.id, blocked:await repo.isBlocked(actorId,match.peer.id), peer:match.peer, youStrong:match.youStrong, peerStrong:match.peerStrong, shared:match.concept, endedAt:session.endedAt, summary:session.summary, match,
    messages:session.messages.map(m => ({ id:m.id, who:m.kind === "facilitator" ? "facilitator" : m.kind === "system" ? "system" : m.authorId===actorId ? "me" : "peer", text:m.text, at:m.createdAt, provenance:m.provenance, demo:m.provenance?.model==="explicit-offline-fixture" })) };
}
