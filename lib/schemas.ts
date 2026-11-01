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
  /** How this learner learns (lib/learn.ts) — Muse builds future nodes from it. */
  learnerSummary: z.string().max(600).default(""),
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

export const TeachRequest = z.object({
  slug,
  learnerSummary: z.string().max(900).default(""),
  depth: z.number().int().min(1).max(5).default(1),
});
export const TeachResult = z.object({
  format: z.enum(["predict", "manipulate", "analogy", "story", "source-clip", "short-read"]),
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(700),
  interaction: z
    .object({
      prompt: z.string().min(1).max(240),
      options: z.array(z.object({ label: z.string().min(1).max(80), reveal: z.string().min(1).max(400) })).min(2).max(4),
    })
    .optional(),
  branches: z.array(z.object({ title: z.string().min(1).max(80), why: z.string().min(1).max(160) })).min(2).max(3),
  challenge: z
    .object({
      kind: z.enum(["spot-the-error", "order-steps", "predict-output", "fill-blank"]),
      prompt: z.string().min(1).max(300),
      options: z.array(z.string().min(1).max(120)).min(3).max(4),
      correct: z.number().int().min(0).max(3),
      explanation: z.string().min(1).max(400),
    })
    .optional(),
  adaptedNote: z.string().max(280),
});

export const CourseRequest = z.object({
  slug,
  learnerSummary: z.string().max(600).default(""),
});
export const CourseResult = z.object({
  lessons: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        body: z.string().min(1).max(600),
        format: z.enum(["hook", "mechanism", "example", "recall"]),
      }),
    )
    .min(3)
    .max(5),
  adaptedNote: z.string().max(240),
});

export const LearningEventRequest = z.object({
  slug,
  kind: z.enum(["seed", "open", "dwell", "skip", "watch", "explain", "session"]),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const PersistConceptRequest = z.object({
  concept: z.object({
    slug,
    title: z.string().trim().min(1).max(80),
    hook: z.string().trim().min(1).max(240),
    domain: z.literal("ai-tech").default("ai-tech"),
  }),
  edge: z.object({ from: slug, kind: edgeKind }).optional(),
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

export const PresenceSnapshot = z.object({
  activeConcepts: z.array(slug).max(5),
  mastery: z.record(slug, z.number().min(0).max(1)),
  openToMatch: z.boolean(),
  language: z.string().min(2).max(8),
});

export const FinishSessionRequest = z.object({
  concepts: z.array(slug).min(1).max(8),
  summary: z.array(z.string().max(240)).max(5).default([]),
});

export const ProfileUpdateRequest = z.object({
  displayName: z.string().trim().min(1).max(40),
  staticProfile: z.object({ role: z.string().max(120), background: z.string().max(1_000), age18Plus: z.boolean() }),
  preferences: z.object({ style: z.string().max(120), pace: z.string().max(120), inferred: z.boolean() }),
  currentIntent: z.string().max(500),
  openToMatch: z.boolean(),
  language: z.string().min(2).max(8),
});

export const McpCall = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
