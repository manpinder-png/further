import { z } from "zod";
import type { AgentRunRecord } from "../data/contracts";
import type { Concept } from "../../lib/types";
import { conceptIndexText } from "./space";

const savedMap = z.object({
  mode: z.literal("live"),
  data: z.object({ concepts: z.array(z.object({ slug: z.string() })) }),
});
const normalizedQuery = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

export function isShortSearchQuery(text: string) {
  return text.trim().length <= 200 && text.trim().split(/\s+/).length <= 12;
}

/** Reuse question-linked saved concepts, never an unrelated global intent. */
export function contextualSearchText(text: string, concepts: Concept[], runs: AgentRunRecord[]) {
  if (!isShortSearchQuery(text)) return text;
  const query = normalizedQuery(text);
  const selected = concepts.find(concept => normalizedQuery(concept.slug) === query || normalizedQuery(concept.title) === query);
  let context = selected ? [selected] : [];
  if (!selected) {
    for (const run of [...runs].sort((a, b) => b.createdAt - a.createdAt)) {
      if (run.agentId !== "knowledge-map" || run.status !== "succeeded" || run.input.objective !== "expand"
        || typeof run.input.text !== "string" || normalizedQuery(run.input.text) !== query) continue;
      const parsed = savedMap.safeParse(run.output);
      if (!parsed.success) continue;
      context = parsed.data.data.concepts.flatMap(({ slug }) => {
        const owned = concepts.find(concept => concept.slug === slug);
        return owned ? [owned] : [];
      });
      break;
    }
  }
  const description = context.slice(0, 3).map(conceptIndexText).join("\n").slice(0, 1000);
  return description ? `${text}\nSaved learning context:\n${description}` : text;
}

/** Selected learning fields only. Demographic/identity/profile attributes are
 * deliberately absent; the result remains private and is never a peer target. */
export function metadataIndexText(values: Record<string, unknown>): string | null {
  const clean = (value: unknown, max = 500) => typeof value === "string" ? value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[email omitted]")
    .replace(/(?:\+?\d[\d(). -]{7,}\d)/g,"[number omitted]")
    .replace(/\s+/g," ").trim().slice(0,max) : "";
  const intent = clean(values.intent,800);
  const goals = Array.isArray(values.goals) ? values.goals.slice(0,8).map(v=>clean(v,250)).filter(Boolean) : [];
  const concepts = Array.isArray(values.concepts) ? values.concepts.slice(0,12).map(v=>v && typeof v === "object" ? clean((v as Record<string,unknown>).title,160) : "").filter(Boolean) : [];
  const matching = clean(values.matchingText,800);
  const lines = [intent && `Learning intent: ${intent}`,goals.length && `Goals: ${goals.join("; ")}`,concepts.length && `Ideas: ${concepts.join("; ")}`,matching && `Learning description: ${matching}`].filter(Boolean);
  return lines.length ? lines.join("\n").slice(0,6000) : null;
}
