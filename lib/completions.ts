import { z } from "zod";

export const CompletionCountsRequest = z.object({
  scopes: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9:_.-]{1,180}$/),
    conceptSlugs: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)).min(1).max(2000),
  }).strict()).max(2000),
}).strict();
export type CompletionScope = z.infer<typeof CompletionCountsRequest>["scopes"][number];
export const CompletionCountsResponse = z.object({
  counts: z.record(z.string(), z.number().int().nonnegative()),
}).strict();
