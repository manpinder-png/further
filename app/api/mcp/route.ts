// F10 / E8: MCP server for Muse / Meta AI connectors (or any MCP client). Owner: Connor.
// JSON-RPC over HTTP POST. TODO(Connor): move to @modelcontextprotocol/sdk with the
// Streamable HTTP transport; the tool contracts below stay the same.
import { McpCall } from "@/lib/schemas";
import { DEMO_MCP_TOKEN, pushInbox } from "@/lib/server/store";
import { CATALOG, seedExplorers } from "@/lib/demo/seed";
import { TOOLS } from "@/lib/mcp-tools";

export const dynamic = "force-dynamic";

const rpc = (id: unknown, result: unknown) => Response.json({ jsonrpc: "2.0", id, result });
const rpcErr = (id: unknown, code: number, message: string, status = 200) => Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token !== DEMO_MCP_TOKEN) return rpcErr(null, -32001, "Invalid or missing token", 401);
  const p = McpCall.safeParse(await req.json().catch(() => null));
  if (!p.success) return rpcErr(null, -32600, "Invalid request", 400);
  const { id, method, params } = p.data;

  if (method === "initialize") return rpc(id, { protocolVersion: "2025-06-18", serverInfo: { name: "further", version: "0.1.0" }, capabilities: { tools: {} } });
  if (method === "tools/list") return rpc(id, { tools: TOOLS });
  if (method !== "tools/call") return rpcErr(id, -32601, "Method not found");

  const name = String(params?.name ?? "");
  const args = (params?.arguments ?? {}) as Record<string, unknown>;
  const text = (t: string) => rpc(id, { content: [{ type: "text", text: t }] });
  switch (name) {
    case "add_curiosity": {
      const t = String(args.text ?? "").trim().slice(0, 500);
      if (t.length < 2) return rpcErr(id, -32602, "text is required");
      pushInbox(t, "mcp");
      return text(`Added "${t}" to your Further map. It's growing now.`);
    }
    case "get_my_map":
      return text(JSON.stringify({ demo: true, concepts: Object.keys(CATALOG).slice(0, 9) }));
    case "next_to_explore":
      return text("Try “Memory bandwidth”: it's one hop from what you already understand. (demo)");
    case "find_peers": {
      const c = String(args.concept ?? "");
      const peers = seedExplorers(Date.now()).filter((e) => e.activeConcepts.includes(c)).map((e) => `${e.name} (seed)`);
      return text(peers.length ? `Exploring ${c} now: ${peers.join(", ")}` : `Nobody on ${c} right now.`);
    }
    default:
      return rpcErr(id, -32602, `Unknown tool ${name}`);
  }
}
