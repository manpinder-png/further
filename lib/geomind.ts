import type { MatchRequest } from "./types";

/** Public discovery projection. Never includes a learner's private map or intent. */
export interface GeomindTopic { slug: string; title: string }
export interface GeomindTopicPair {
  ownTopic: GeomindTopic;
  peerTopic: GeomindTopic;
  /** Raw cosine in the documented encoder space, not confidence or expertise. */
  similarity: number;
}
export type GeomindReason =
  | { kind: "shared-topic"; slug: string; title: string }
  | { kind: "related-topic"; ownTopic: GeomindTopic; peerTopic: GeomindTopic; similarity: number }
  | { kind: "reviewed-explanation"; slug: string; title: string; by: "you" | "peer" };
export interface GeomindNeighbor {
  id: string;
  name: string;
  availableNow: true;
  commonMinutes: number;
  sharedTopics: GeomindTopic[];
  /** Authorized related topic pairs; neither raw peer intent nor whole maps. */
  topicPairs?: GeomindTopicPair[];
  /** Semantic closeness only. `overlap` is retained for older local callers. */
  proximity: { overlap: number; similarity?: number; method: "ranked-overlap-v1" | "semantic-cosine-v1" };
  recommendationScore?: number;
  reasons: GeomindReason[];
}
export interface GeomindRequest { conceptSlugs?: string[] }
export interface GeomindInviteRequest { peerId: string; conceptSlug: string; peerConceptSlug?: string }
export interface GeomindInviteResponse { match: MatchRequest }
export interface GeomindResponse {
  version: 1;
  generatedAt: number;
  mode: "available-now";
  viewer: { discoveryEnabled: boolean; adultConfirmed: boolean };
  scope: { kind: "all-topics" | "question"; conceptSlugs: string[] };
  neighbors: GeomindNeighbor[];
  limit: number;
  hasMore: boolean;
  index?: { status: "ready" | "indexing" | "unavailable"; model: string; modelRevision: string; indexedConcepts: number; concepts: number; calibration?: "experimental"; minSimilarity?: number };
  emptyReason?: "discovery-off" | "adult-confirmation-needed" | "no-topics" | "no-neighbors" | "indexing" | "index-unavailable";
}
