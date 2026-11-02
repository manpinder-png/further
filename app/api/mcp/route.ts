import { handle,json } from "@/domains/backend/http";
export async function POST(req:Request){return handle(req,async()=>json({error:"The old demo connector has been retired. Use the authenticated local /api/agents interface. A standards-compliant MCP or A2A adapter is not implemented yet."},410));}
