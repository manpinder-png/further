import { KnowledgeMapOutput } from "@/domains/agents/contracts";
import type { Mission } from "@/domains/ui/contracts";

/** The subset of a saved agent run that saved-question reconstruction needs. */
export interface SavedExpansionRun {
  id: string;
  agentId: string;
  input: Record<string, unknown>;
  output?: { data?: unknown } | null;
  status: string;
  error?: string | null;
  createdAt: number;
}

/**
 * Saved questions from durable expand runs. A "go deeper" run names the question it
 * extends; its concepts join that question's path instead of becoming a separate
 * question, so a learner can keep building out one topic without a dead end.
 * A deeper run whose parent is missing stays visible as its own question rather than vanishing.
 */
export function missionsFromRuns(runs: readonly SavedExpansionRun[]): Mission[] {
  const expansions = runs.filter(run => run.agentId === "knowledge-map" && (run.input.objective ?? "expand") === "expand");
  const parents = new Map<string, Mission>();
  const deeper: SavedExpansionRun[] = [];
  for (const run of expansions) {
    if (typeof run.input.extendsRunId === "string" && run.input.extendsRunId) deeper.push(run);
    else parents.set(run.id, toMission(run));
  }
  const orphans: Mission[] = [];
  for (const run of deeper) {
    const parent = parents.get(run.input.extendsRunId as string);
    if (!parent) { orphans.push(toMission(run)); continue; }
    // In-flight or failed deeper attempts are reported by the client that started them.
    if (run.status !== "succeeded") continue;
    const slugs = conceptSlugs(run).filter(slug => !parent.slugs!.includes(slug));
    parent.slugs!.push(...slugs);
    parent.added += slugs.length;
  }
  return [...parents.values(), ...orphans];
}

function conceptSlugs(run: SavedExpansionRun): string[] {
  const parsed = KnowledgeMapOutput.safeParse(run.output?.data);
  return parsed.success ? parsed.data.concepts.map(concept => concept.slug) : [];
}

function toMission(run: SavedExpansionRun): Mission {
  const parsed = KnowledgeMapOutput.safeParse(run.output?.data);
  const data = parsed.success ? parsed.data : null;
  return {
    id: parseInt(run.id.replaceAll("-", "").slice(0, 12), 16),
    runId: run.id,
    text: typeof run.input.text === "string" ? run.input.text : "Learning question",
    source: "agent",
    at: run.createdAt,
    status: run.status === "succeeded" ? "done" : run.status === "failed" ? "error" : "running",
    intent: data?.intent,
    error: run.error ?? undefined,
    added: data?.concepts.length ?? 0,
    reused: 0,
    slugs: data?.concepts.map(concept => concept.slug) ?? [],
  };
}
