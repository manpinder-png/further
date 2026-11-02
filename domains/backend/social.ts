import type { Invitation, FurtherRepository, LearningSession } from "../data/contracts";
import type { Explorer, MatchRequest } from "../../lib/types";
import { scorePair, MATCH_THRESHOLD } from "../../lib/matching";

export async function rankedPeers(repo: FurtherRepository, actorId: string) {
  const snapshot = await repo.getSnapshot(actorId);
  const profile = snapshot.profile;
  const active = Object.values(snapshot.nodes).filter(n => n.interest >= .2).sort((a,b) => b.interest-a.interest).slice(0,5);
  const me: Explorer = { id: actorId, name: profile.displayName, demo: false, activeConcepts: active.map(n => n.slug), mastery: Object.fromEntries(active.map(n => [n.slug,n.mastery])), openToMatch: profile.openToMatch, language: profile.language, lastActive: Date.now(), color: "#f26b1d" };
  const peers = await repo.listCandidates(actorId);
  return peers.filter(p => Math.min(p.availableMinutes, profile.availableMinutes) >= 10)
    .map(peer => ({ peer, ...scorePair({ a: me, b: peer, edges: snapshot.edges, now: Date.now() }) }))
    .sort((a,b) => b.score-a.score);
}

export async function toMatch(repo: FurtherRepository, actorId: string, inv: Invitation): Promise<MatchRequest> {
  const peerId = inv.fromUserId === actorId ? inv.toUserId : inv.fromUserId;
  const peerProfile = await repo.getProfile(peerId);
  const fromStrong = String(inv.context.fromStrong ?? inv.conceptSlug);
  const toStrong = String(inv.context.toStrong ?? inv.conceptSlug);
  const peerStrong = actorId === inv.fromUserId ? toStrong : fromStrong;
  return {
    id: inv.id, peer: { id: peerId, name: peerProfile.displayName, demo: false, activeConcepts: [inv.conceptSlug], mastery: {}, openToMatch: peerProfile.openToMatch, language: peerProfile.language, lastActive: inv.createdAt, color: "#4ddfe6" },
    concept: inv.conceptSlug, peerStrong, youStrong: actorId === inv.fromUserId ? fromStrong : toStrong,
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

export async function suggestMatch(repo: FurtherRepository, actorId: string) {
  await repo.heartbeat(actorId);
  const existing = await currentMatch(repo,actorId);
  const ranked = await rankedPeers(repo,actorId);
  if (existing) return { threshold: MATCH_THRESHOLD, ranked, match: existing, demo: false };
  const best = ranked.find(r => r.score >= MATCH_THRESHOLD);
  if (!best) return { threshold: MATCH_THRESHOLD, ranked, match: null, demo: false };
  const snap = await repo.getSnapshot(actorId);
  const shared = best.peer.activeConcepts.find(s => snap.nodes[s]);
  if (!shared) return { threshold: MATCH_THRESHOLD, ranked, match: null, demo: false };
  const fromStrong = Object.values(snap.nodes).sort((a,b) => b.mastery-a.mastery)[0]?.slug ?? shared;
  const toStrong = best.teach?.from === "b" ? best.teach.slug : Object.entries(best.peer.mastery).sort((a,b) => b[1]-a[1])[0]?.[0] ?? shared;
  const inv = await repo.invite(actorId,best.peer.id,shared, { score: best.score, reason: `You both want to explore ${shared.replaceAll("-"," ")}. Exchange what you know and work through one question together.`, context: { fromStrong,toStrong,shared } });
  return { threshold: MATCH_THRESHOLD, ranked, match: await toMatch(repo,actorId,inv), demo: false };
}

export async function roomView(repo: FurtherRepository, actorId: string, session: LearningSession) {
  const invitation = await repo.getInvitation(actorId,session.invitationId);
  const match = await toMatch(repo,actorId,invitation);
  return { id:session.id, blocked:await repo.isBlocked(actorId,match.peer.id), peer:match.peer, youStrong:match.youStrong, peerStrong:match.peerStrong, shared:session.conceptSlug, endedAt:session.endedAt, summary:session.summary, match,
    messages:session.messages.map(m => ({ id:m.id, who:m.kind === "facilitator" ? "facilitator" : m.kind === "system" ? "system" : m.authorId===actorId ? "me" : "peer", text:m.text, at:m.createdAt, provenance:m.provenance, demo:m.provenance?.model==="explicit-offline-fixture" })) };
}
