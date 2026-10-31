// Zod schemas for every API boundary (plan E9: "All inputs validated with Zod").
import { z } from "zod";

export const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const edgeKind = z.enum(["prerequisite", "related", "part_of"]);

export const ExpandRequest = z.object({
  text: z.string().trim().min(2).max(500),
  /** Short summary of the user's map so the model prefers new concepts. */
  mapSummary: z.array(slug).max(200).default([]),
});

// Raw model output, one JSON object per line. Invalid lines are dropped (plan §9).
export const ModelIntentLine = z.object({
  intent: z.string().min(1).max(200),
  root: slug,
  rootTitle: z.string().max(80).optional(),
});
export const ModelNodeLine = z.object({
  slug,
  title: z.string().min(1).max(80),
  hook: z.string().min(1).max(200),
  edge: z.object({ from: slug, kind: edgeKind }),
  difficulty: z.number().int().min(1).max(5),
});

export const ExplainRequest = z.object({
  slug,
  transcript: z.string().trim().min(1).max(3000),
});
export const ExplainResult = z.object({
  score: z.number().int().min(0).max(3),
  feedback: z.string().max(240),
});

export const ModerateRequest = z.object({
  sessionId: z.string().min(1).max(64),
  from: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(1000),
});

export const VerifyRequest = z.object({ url: z.string().url().max(500) });

export const MatchDecision = z.object({
  requestId: z.string().min(1).max(64),
  decision: z.enum(["accept", "decline"]),
});

export const McpCall = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
