/** Derived map organization, separate from canonical concepts and learning evidence. */
export interface KnowledgeOverviewGroup {
  id: string; title: string; summary: string; conceptSlugs: string[];
  /** Derived child summaries. These never create canonical concepts or evidence. */
  children?: KnowledgeOverviewGroup[];
  /** A real concept can also be a container for its saved part-of descendants. */
  anchorSlug?: string;
}
export type KnowledgeTopicGroup = KnowledgeOverviewGroup;
export interface KnowledgeOverview { groups: KnowledgeOverviewGroup[]; explanation: string }
export type KnowledgeOverviewMode = "live" | "fixture";
export interface KnowledgeOverviewSnapshot {
  sourceHash: string;
  status: "empty" | "missing" | "ready";
  overview?: KnowledgeOverview;
  runId?: string;
  mode?: KnowledgeOverviewMode;
  attempt?: string;
  requestStatus?: "running" | "failed";
  retryWithNewKey?: boolean;
}
export interface KnowledgeOverviewRequest { sourceHash: string; attempt?: string; conceptSlugs?: string[] }
export interface KnowledgeOverviewResult { sourceHash: string; overview: KnowledgeOverview; runId: string; mode: KnowledgeOverviewMode }

export const KNOWLEDGE_OVERVIEW_PROMPT_VERSION = "knowledge-overview-v2";
export const KNOWLEDGE_OVERVIEW_REQUEST = "Organize my complete saved knowledge map into a small set of clear topic groups. Describe the ideas and their relationships, without judging my knowledge or changing my map.";
