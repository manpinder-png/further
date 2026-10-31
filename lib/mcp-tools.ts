// MCP tool contracts (plan §5.7). Shared by the /api/mcp route and the /connectors page.
export const TOOLS = [
  { name: "add_curiosity", description: "Add something you're curious about to your Further map.", inputSchema: { type: "object", properties: { text: { type: "string", maxLength: 500 } }, required: ["text"] } },
  { name: "get_my_map", description: "Return the concepts on your map with interest and mastery.", inputSchema: { type: "object", properties: {} } },
  { name: "next_to_explore", description: "Suggest the next concept to explore.", inputSchema: { type: "object", properties: {} } },
  { name: "find_peers", description: "Find people exploring a concept right now.", inputSchema: { type: "object", properties: { concept: { type: "string" } }, required: ["concept"] } },
];
