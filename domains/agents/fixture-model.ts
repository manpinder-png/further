import type { AgentModel, ModelRequest, ModelTurn } from "./contracts.ts";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "learning-topic";
const words = (s: string) => s.replace(/[?!.]/g, "").trim().slice(0, 90);
function inputFrom(request: ModelRequest): Record<string, unknown> {
  const first = request.messages.find((m) => m.role === "user");
  try { return JSON.parse(first?.content ?? "{}").input ?? {}; } catch { return {}; }
}
function response(data: unknown): ModelTurn {
  return { text: JSON.stringify(data), toolCalls: [], provider: "fixture", model: "explicit-offline-fixture", usage: { inputTokens: 0, outputTokens: 0 } };
}

/** Deliberately selected offline rehearsal. It never substitutes for a failed live model. */
export class FixtureAgentModel implements AgentModel {
  async complete(request: ModelRequest): Promise<ModelTurn> {
    const input = inputFrom(request);
    const text = String(input.text ?? input.concept ?? "A learning topic");
    const title = words(text);
    // A go-deeper rehearsal attaches its concepts under the focused concept, like the live agent.
    const focus = input.focus as { slug?: unknown } | undefined;
    const focusSlug = typeof focus?.slug === "string" ? focus.slug : null;
    if (request.agentId === "metadata") return response({
      intent: title, goals: ["Explore this question"], concepts: [{ slug: slug(title), title, confidence: 0.3 }],
      experience: "unknown", language: null, availableMinutes: null, participation: "unknown",
      matchingText: title, uncertainty: ["Offline fixture: metadata has not been inferred by a model."],
    });
    if (request.agentId === "knowledge-map") {
      const preparedTools = JSON.parse(request.messages.find(message => message.role === "user")?.content ?? "{}").preparedTools ?? {};
      if (!preparedTools.get_map || (input.objective === "recommend" && !request.messages.some(message => message.toolCallId === "fixture_peers"))) return {
        ...response(null), text: "", toolCalls: [
          ...(preparedTools.get_map ? [] : [{ id: "fixture_map", name: "get_map", arguments: "{}" }]),
          ...(input.objective === "recommend" ? [{ id: "fixture_peers", name: "find_peers", arguments: JSON.stringify({ query: text, limit: 5 }) }] : []),
        ],
      };
      if (input.objective === "summarize") {
        const source = request.messages.find(message => message.toolCallId === "fixture_map");
        const map = (preparedTools.get_map ?? JSON.parse(source?.content ?? "{}")) as { concepts?: Array<{ slug: string; title: string }> };
        const saved = map.concepts ?? [];
        return response({ intent: "Your saved topics", root: saved[0]?.slug ?? "empty", rootTitle: saved[0]?.title ?? "Your saved topics", concepts: [], groups: saved.length ? [{ id: "saved-topics", title: "Saved topics · rehearsal", summary: "Offline rehearsal groups all supplied topics together. A real Meta model is needed to organize them by meaning.", conceptSlugs: saved.map(concept => concept.slug) }] : [], explanation: "Explicit offline rehearsal. No model organized these topics or inferred understanding.", recommendedPeerIds: [], nextActions: [] });
      }
      const focusTitle = typeof (input.focus as { title?: unknown } | undefined)?.title === "string" ? String((input.focus as { title: string }).title) : null;
      // Going deeper attaches distinct children under the focused concept; a fresh question starts from its own root.
      const concepts = focusSlug && focusTitle ? [
        { slug: slug(focusTitle + " key parts"), title: `${focusTitle}: key parts`, hook: "Name the pieces and what each one is responsible for.", difficulty: 0.3, edge: { from: focusSlug, kind: "part_of" } },
        { slug: slug(focusTitle + " mechanism"), title: `${focusTitle}: how it works`, hook: "Follow one pass through the mechanism step by step.", difficulty: 0.4, edge: { from: focusSlug, kind: "part_of" } },
        { slug: slug(focusTitle + " deeper example"), title: `${focusTitle}: a harder example`, hook: "Change one input and predict what happens.", difficulty: 0.5, edge: { from: focusSlug, kind: "related" } },
      ] : [
        { slug: slug(title), title, hook: "Start with the question you brought.", difficulty: 0.2 },
        { slug: slug(title + " foundations"), title: "Foundations", hook: "Identify the parts and what each one does.", difficulty: 0.3, edge: { from: slug(title), kind: "part_of" } },
        { slug: slug(title + " examples"), title: "A worked example", hook: "Explain one small example in your own words.", difficulty: 0.4, edge: { from: slug(title), kind: "related" } },
      ];
      const peers = request.messages.find((m) => m.toolCallId === "fixture_peers");
      const ids = peers ? (JSON.parse(peers.content).peers ?? []).map((p: { id: string }) => p.id) : [];
      return response({ intent: title, root: concepts[0].slug, rootTitle: title, concepts: input.objective === "plan" || input.objective === "recommend" ? [] : concepts, explanation: "Offline fixture for exercising the local data and agent boundaries. No model generated this advice.", recommendedPeerIds: ids, nextActions: ["Try explaining one example"] });
    }
    if (request.agentId === "learning-companion") {
      const mode = input.mode ?? "solo";
      return response({ mode, title: `${title}: practice`,
        body: mode === "facilitate" ? "Offline rehearsal: invite each person to explain one part, then find a question that needs both explanations." : mode === "explain-back" ? "Offline rehearsal feedback. A real evaluation needs the configured Meta model." : `Offline rehearsal: explain ${title} with one concrete example, then change one part and predict what happens.`,
        format: mode === "facilitate" ? "discussion" : mode === "explain-back" ? "feedback" : "predict",
        interaction: mode === "solo" ? { prompt: "Which is more useful for testing your explanation?", options: [{ label: "Try a new example", reveal: "A new example tests whether the idea transfers." }, { label: "Repeat the same words", reveal: "Repetition can help recall; an example also tests understanding." }] } : null,
        branches: [], challenge: null, adaptedNote: "Explicit offline fixture; no model personalization.", score: null,
        nextPrompt: mode === "explain-back" ? `Offline rehearsal: apply ${title} to a different everyday situation. What stays the same and what changes?` : "",
        lessons: input.presentation === "course" ? [
          { title: "Name the question", body: "Offline practice: write one question you want this concept to answer.", format: "hook" },
          { title: "Make an example", body: "Offline practice: choose a small example and explain what changes at each step.", format: "example" },
          { title: "Explain it back", body: "Offline practice: close the notes and explain what you now understand. This template does not evaluate your answer.", format: "recall" },
        ] : [],
      });
    }
    if (request.agentId === "resource-guide") return response({ answer: "Offline rehearsal does not invent or verify source links.", sources: [], grounded: false });
    if (request.agentId === "perception") return response({ description: "Image received in offline rehearsal mode; its contents were not analyzed.", suggestedCuriosity: "What would you like to understand about this image?", concepts: [], uncertainty: ["Visual understanding requires the configured Meta model."] });
    return response({});
  }
}
