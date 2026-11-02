/** Safe operational progress only. Draft text is never a persisted result. */
import type { AgentEvent } from "../agents/contracts";
export type ActivityEvent = Extract<AgentEvent, { type: "activity" }>;
export type ProgressEvent = AgentEvent;
export interface ActivityState {
  status: "idle" | "running" | "completed" | "error" | "cancelled";
  events: ActivityEvent[];
  drafts: Record<string, { agentId: string; field: string; text: string }>;
  startedAt: number;
  lastEventAt: number;
  finishedAt?: number;
  error?: string;
  notice?: string;
}
export const emptyActivity = (): ActivityState => ({ status: "idle", events: [], drafts: {}, startedAt: 0, lastEventAt: 0 });
export const DRAFT_FIELDS = new Set(["body", "answer", "explanation", "intent", "description", "suggestedCuriosity", "transcript"]);
export function applyProgress(state: ActivityState, event: ProgressEvent): ActivityState {
  if (state.status !== "running") return state;
  if (event.type === "activity") {
    const drafts = event.phase === "thinking"
      ? Object.fromEntries(Object.entries(state.drafts).filter(([, draft]) => draft.agentId !== event.agentId))
      : state.drafts;
    return { ...state, lastEventAt: Date.now(), drafts, events: [...state.events.slice(-49), event] };
  }
  if (!DRAFT_FIELDS.has(event.field)) return state;
  const key = `${event.agentId}:${event.field}`;
  return { ...state, lastEventAt: Date.now(), drafts: { ...state.drafts, [key]: { agentId: event.agentId, field: event.field, text: (event.replace ? "" : state.drafts[key]?.text ?? "") + event.delta } } };
}
