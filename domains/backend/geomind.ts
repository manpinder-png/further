import { z } from "zod";
import type { GeomindNeighbor, GeomindResponse } from "../../lib/geomind";
import { slug } from "../../lib/schemas";
import { SEMANTIC_MATCHING_VERSION } from "../../lib/matching";
import type { MatchRequest } from "../../lib/types";
import type { FurtherRepository, Invitation } from "../data/contracts";
import { HttpError } from "./http";
import { createSemanticInvitation, MatchConceptScope, scopeFor, semanticPeerSearch, toMatch } from "./social";

export const GeomindRequestSchema = z.object({ conceptSlugs: MatchConceptScope.optional() }).strict();
export const GeomindInviteSchema = z.object({ peerId: z.string().uuid(), conceptSlug: slug, peerConceptSlug: slug.optional() }).strict();
const LIMIT = 24;

/** One vector retrieval engine, projected as a privacy-minimal neighborhood. */
export async function geomindNeighborhood(repo: FurtherRepository, actorId: string, conceptSlugs?: string[]): Promise<GeomindResponse> {
  const { snapshot, active, ranked, index } = await semanticPeerSearch(repo, actorId, conceptSlugs);
  const result: GeomindResponse = {
    version: 1, generatedAt: Date.now(), mode: "available-now",
    viewer: { discoveryEnabled: snapshot.profile.openToMatch, adultConfirmed: snapshot.profile.staticProfile.age18Plus },
    scope: { kind: conceptSlugs === undefined ? "all-topics" : "question", conceptSlugs: active.map(node => node.slug) },
    neighbors: [], limit: LIMIT, hasMore: false, index,
  };
  if (!snapshot.profile.staticProfile.age18Plus) return { ...result, emptyReason: "adult-confirmation-needed" };
  if (!snapshot.profile.openToMatch) return { ...result, emptyReason: "discovery-off" };
  if (!active.length) return { ...result, emptyReason: "no-topics" };
  const neighbors: GeomindNeighbor[] = ranked.map(peer => {
    const topics = [...new Map(peer.topicPairs.map(pair => [pair.ownTopic.slug, pair.ownTopic])).values()];
    const reasons: GeomindNeighbor["reasons"] = peer.topicPairs.slice(0, 4).map(pair => pair.ownTopic.slug === pair.peerTopic.slug
      ? { kind: "shared-topic", ...pair.ownTopic }
      : { kind: "related-topic", ...pair });
    for (const pair of peer.topicPairs.slice(0, 4)) {
      if ((snapshot.nodes[pair.ownTopic.slug]?.mastery ?? 0) >= 2 / 3) reasons.push({ kind: "reviewed-explanation", ...pair.ownTopic, by: "you" });
      if ((peer.peer.mastery[pair.peerTopic.slug] ?? 0) >= 2 / 3) reasons.push({ kind: "reviewed-explanation", ...pair.peerTopic, by: "peer" });
    }
    return { id: peer.peer.id, name: peer.peer.name, availableNow: true, commonMinutes: peer.commonMinutes,
      sharedTopics: topics, topicPairs: peer.topicPairs, recommendationScore: peer.score,
      proximity: { overlap: peer.semanticSimilarity, similarity: peer.semanticSimilarity, method: SEMANTIC_MATCHING_VERSION }, reasons };
  });
  // Community placement is semantic only; time/evidence scoring never changes it.
  neighbors.sort((a, b) => (b.proximity.similarity ?? 0) - (a.proximity.similarity ?? 0) || a.id.localeCompare(b.id));
  const emptyReason = neighbors.length ? undefined : index.status === "indexing" ? "indexing" : index.status === "unavailable" ? "index-unavailable" : "no-neighbors";
  return { ...result, neighbors: neighbors.slice(0, LIMIT), hasMore: neighbors.length > LIMIT, ...(emptyReason ? { emptyReason } : {}) };
}

function otherParticipant(inv: Invitation, actorId: string) {
  return inv.fromUserId === actorId ? inv.toUserId : inv.fromUserId;
}

function invitationTopics(inv: Invitation, actorId: string) {
  const receiverTopic = String(inv.context.peerConceptSlug ?? inv.conceptSlug);
  return inv.fromUserId === actorId ? { own: inv.conceptSlug, peer: receiverTopic } : { own: receiverTopic, peer: inv.conceptSlug };
}

async function activeInvitations(repo: FurtherRepository, actorId: string) {
  const active: Invitation[] = [];
  for (const inv of await repo.getInvitations(actorId)) {
    if (inv.status === "pending") active.push(inv);
    else if (inv.status === "accepted" && inv.sessionId && !(await repo.getSession(actorId, inv.sessionId)).endedAt) active.push(inv);
  }
  return active;
}

/** Exact person and pair, re-retrieved on the server before an invitation. */
export async function inviteGeomindNeighbor(repo: FurtherRepository, actorId: string, peerId: string, conceptSlug: string, peerConceptSlug?: string): Promise<MatchRequest> {
  GeomindInviteSchema.parse({ peerId, conceptSlug, peerConceptSlug });
  if (peerId === actorId) throw new HttpError(400, "Choose another learner.");
  const snapshot = await repo.getSnapshot(actorId);
  scopeFor(snapshot, [conceptSlug]);
  for (const inv of await activeInvitations(repo, actorId)) {
    const topics = invitationTopics(inv, actorId);
    if (otherParticipant(inv, actorId) !== peerId || topics.own !== conceptSlug || (peerConceptSlug && topics.peer !== peerConceptSlug)) {
      throw new HttpError(409, "Finish your current invitation or conversation before starting another.");
    }
    return toMatch(repo, actorId, inv);
  }
  await repo.heartbeat(actorId);
  // Recheck the current neighborhood, not an isolated weak pair which would
  // become its own best result. An older explicitly chosen topic can join the
  // bounded current scope without making another person's private history public.
  const currentScope = Object.values(snapshot.nodes).filter(node => node.interest >= .2)
    .sort((a, b) => b.interest - a.interest || a.slug.localeCompare(b.slug)).slice(0, 5).map(node => node.slug);
  const inviteScope = currentScope.includes(conceptSlug) ? currentScope : [conceptSlug, ...currentScope.slice(0, 4)];
  const result = await semanticPeerSearch(repo, actorId, inviteScope);
  const peer = result.ranked.find(candidate => candidate.peer.id === peerId);
  const pair = peer?.topicPairs.find(candidate => candidate.ownTopic.slug === conceptSlug && (!peerConceptSlug || candidate.peerTopic.slug === peerConceptSlug));
  // The returned pair has already passed current source-hash/model/revision
  // guards. Other people's missing vectors must not invalidate that pair.
  if ((!peer || !pair) && result.index.status === "unavailable") throw new HttpError(503, "Semantic discovery is unavailable for the current index. Your saved map has not changed.");
  if ((!peer || !pair) && result.index.status !== "ready") throw new HttpError(409, "Semantic discovery is still indexing. Wait for the map to finish updating before inviting someone.");
  if (!peer || !pair) throw new HttpError(409, "This learner is no longer available around that idea. Refresh Geomind to see who is nearby.");
  if ((await activeInvitations(repo, peerId)).some(inv => otherParticipant(inv, peerId) !== actorId || invitationTopics(inv, peerId).own !== pair.peerTopic.slug)) {
    throw new HttpError(409, "This learner has another invitation or conversation in progress. Refresh Geomind to see who is nearby.");
  }
  return createSemanticInvitation(repo, actorId, peer, pair);
}
