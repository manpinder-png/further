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
    if (request.agentId === "metadata") return response({
      intent: title, goals: ["Explore this question"], concepts: [{ slug: slug(title), title, confidence: 0.3 }],
      experience: "unknown", language: null, availableMinutes: null, participation: "unknown",
      matchingText: title, uncertainty: ["Offline fixture: metadata has not been inferred by a model."],
    });
    if (request.agentId === "knowledge-map") {
      if (!request.messages.some((m) => m.role === "tool")) return {
        ...response(null), text: "", toolCalls: [
          { id: "fixture_map", name: "get_map", arguments: "{}" },
          { id: "fixture_metadata", name: "infer_metadata", arguments: JSON.stringify({ text }) },
          ...(input.objective === "recommend" ? [{ id: "fixture_peers", name: "find_peers", arguments: JSON.stringify({ query: text, limit: 5 }) }] : []),
        ],
      };
      const concepts = [
        { slug: slug(title), title, hook: "Start with the question you brought.", difficulty: 0.2 },
        { slug: slug(title + " foundations"), title: "Foundations", hook: "Identify the parts and what each one does.", difficulty: 0.3, edge: { from: slug(title), kind: "part_of" } },
        { slug: slug(title + " examples"), title: "A worked example", hook: "Explain one small example in your own words.", difficulty: 0.4, edge: { from: slug(title), kind: "related" } },
      ];
      const peers = request.messages.find((m) => m.toolCallId === "fixture_peers");
      const ids = peers ? (JSON.parse(peers.content).peers ?? []).map((p: { id: string }) => p.id) : [];
      return response({ intent: title, root: concepts[0].slug, rootTitle: title, concepts, explanation: "Offline fixture map for exercising the local data and agent boundaries. No model generated these topics.", recommendedPeerIds: ids, nextActions: ["Open a topic", "Try explaining one example"] });
    }
    if (request.agentId === "learning-companion") {
      const mode = input.mode ?? "solo";
      return response({ mode, title: `${title}: practice`,
        body: mode === "facilitate" ? "Offline rehearsal: invite each person to explain one part, then find a question that needs both explanations." : mode === "explain-back" ? "Offline rehearsal feedback. A real evaluation needs the configured Meta model." : `Offline rehearsal: explain ${title} with one concrete example, then change one part and predict what happens.`,
        format: mode === "facilitate" ? "discussion" : mode === "explain-back" ? "feedback" : "predict",
        interaction: mode === "solo" ? { prompt: "Which is more useful for testing your explanation?", options: [{ label: "Try a new example", reveal: "A new example tests whether the idea transfers." }, { label: "Repeat the same words", reveal: "Repetition can help recall; an example also tests understanding." }] } : null,
        branches: [], challenge: null, adaptedNote: "Explicit offline fixture; no model personalization.", score: null,
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
