import "server-only";

// DEMO in-memory inbox standing in for Supabase Realtime Broadcast.
// MCP `add_curiosity` pushes here; the map polls /api/inbox. Owner: Amit/Connor.
// Production: insert into `events` and broadcast on channel `user:{id}`.
type Item = { id: number; text: string; source: string; at: number };
const g = globalThis as unknown as { __furtherInbox?: Item[]; __furtherSeq?: number };
g.__furtherInbox ??= [];
g.__furtherSeq ??= 1;

export function pushInbox(text: string, source: string) {
  const item = { id: g.__furtherSeq!++, text, source, at: Date.now() };
  g.__furtherInbox!.push(item);
  if (g.__furtherInbox!.length > 50) g.__furtherInbox!.shift();
  return item;
}

export function readInbox(after: number) {
  return g.__furtherInbox!.filter((i) => i.id > after);
}

/** DEMO per-user MCP token. Production: hashed tokens in a `mcp_tokens` table. */
export const DEMO_MCP_TOKEN = "fur_demo_7f3a9c";
